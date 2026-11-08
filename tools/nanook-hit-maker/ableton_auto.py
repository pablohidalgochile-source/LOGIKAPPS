"""Local automatic synchronization, with common ancestors and no-op suppression."""
from copy import deepcopy
import json
from pathlib import Path
import threading
import time
from uuid import uuid4

from ableton import channel_parts, hash_json, sections_for
from ableton_return import note_rows, section_rows
from store import atomic, Conflict, ID, validate

EDITABLE = ('title','bpm','duration','key','chords','idea','lyrics','style','exclude','parts','structure','hits','ableton_structure','audio_tracks')
ACTIVE = {'queued','running','locators','verifying','verifying-sync','applying'}


def musical_hash(p):
    return hash_json({'bpm':p['bpm'],'duration':round(p['duration'],4),
        'parts':{k:note_rows(v['notes'],p['bpm']) for k,v in channel_parts(p).items()},'structure':section_rows(sections_for(p)),
        'audio':[{k:v for k,v in t.items() if k!='previewAssetId'} for t in p.get('audio_tracks',[])]})


def part_map(p):
    output={};seen={}
    for part in p['parts']:
        occurrence=seen.get(part['key'],0);seen[part['key']]=occurrence+1
        key=part.get('abletonChannel') or 'm-'+hash_json([part['key'],occurrence])[:12]
        if key in output:raise ValueError('Identidades de partes duplicadas.')
        output[key]=part
    return output


def part_value(p):
    if p is None:return None
    return {k:v for k,v in p.items() if k not in {'abletonChannel','source'}}


def editor_merge(base, draft, current, force=False):
    """Rebase browser edits on newer server revisions without reverting other work."""
    patch={};conflicts=[]
    for key in EDITABLE:
        if key in {'parts','audio_tracks'}:continue
        a,b,c=base.get(key),draft.get(key),current.get(key)
        if a==b:continue
        if c!=a and c!=b and not (key=='duration' and abs((c or 0)-(a or 0))<.0001):conflicts.append(key)
        patch[key]=deepcopy(b)
    bm,dm,cm=part_map(base),part_map(draft),deepcopy(part_map(current))
    for key in bm.keys()|dm.keys():
        a,b,c=bm.get(key),dm.get(key),cm.get(key)
        if part_value(a)==part_value(b):continue
        if part_value(c)!=part_value(a) and part_value(c)!=part_value(b):conflicts.append('Parte: '+(b or a)['name'])
        if b is None:cm.pop(key,None)
        else:cm[key]={**deepcopy(b),'abletonChannel':(c or a or {}).get('abletonChannel',key)}
    audio={t['id']:deepcopy(t) for t in current.get('audio_tracks',[])}
    ab={t['id']:t for t in base.get('audio_tracks',[])};ad={t['id']:t for t in draft.get('audio_tracks',[])}
    value=lambda t:{k:v for k,v in t.items() if k!='previewAssetId'} if t else None
    for key in ab.keys()|ad.keys():
        a,b,c=ab.get(key),ad.get(key),audio.get(key)
        if value(a)==value(b):continue
        if value(c)!=value(a) and value(c)!=value(b):conflicts.append('Audio: '+(b or a)['name'])
        if b is None:
            # Retire clips, keeping the linked track and its devices.
            audio[key]={**(c or a),'clips':[]}
        else:audio[key]=deepcopy(b)
    if audio or 'audio_tracks' in current:patch['audio_tracks']=list(audio.values())
    if conflicts and not force:return None,conflicts
    patch['parts']=list(cm.values())
    return patch,conflicts


class AbletonAuto:
    def __init__(self, manager):
        self.manager=manager;self.store=manager.store;self.root=manager.root
        self.control_path=self.root/'auto-control.json';self.state_path=self.root/'auto-state.json'
        self.controls=self.read(self.control_path,{})
        self.states=self.read(self.state_path,{})
        self.quiet={};self.leases={};self.stop=threading.Event();self.thread=None
        self.drafts=self.root/'editor-drafts';self.drafts.mkdir(exist_ok=True)
        self.history=self.root/'auto-history';self.history.mkdir(exist_ok=True)

    @staticmethod
    def read(path, default=None):
        try:return json.loads(path.read_text())
        except (OSError,ValueError):return deepcopy(default)

    def start_worker(self):
        if self.thread:return
        self.thread=threading.Thread(target=self.run,daemon=True,name='nanook-ableton-sync');self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:self.thread.join(timeout=10)

    def run(self):
        while not self.stop.wait(.5):
            try:self.tick()
            except Exception as e:
                # Keep the server alive; never silently retry a partially written Live job.
                self.last_error=str(e)[:1200]

    def state(self, identifier, state, message, **extra):
        old=self.states.get(identifier,{})
        value={**old,'state':state,'message':message,**extra}
        if value!=old:
            value['updatedAt']=time.time();self.states[identifier]=value;atomic(self.state_path,self.states)
        return value

    def control(self, identifier, enabled, path=None):
        old=self.controls.get(identifier,{})
        value={'enabled':enabled,'setPath':path or old.get('setPath'),'generation':uuid4().hex}
        self.controls[identifier]=value;atomic(self.control_path,self.controls);return value

    def status(self, identifier):
        p=self.store.load(identifier);live=self.manager.status();control=self.controls.get(identifier,{})
        state=deepcopy(self.states.get(identifier,{'state':'waiting','message':'Esperando el Set vinculado y el puente 0.6.'}))
        state.update(enabled=control.get('enabled',True),setPath=control.get('setPath'),revision=p['revision'])
        if not control.get('enabled',True):state.update(state='paused',message='Sincronización pausada. Tus cambios siguen guardados.')
        elif not live['connected']:state.update(state='offline',message='Ableton no está conectado. Se retomará al volver al Set vinculado.')
        return state

    def configure(self, identifier, body):
        with self.manager.lock:
            self.store.load(identifier)
            if type(body.get('enabled')) is not bool:raise ValueError('Estado de sincronización inválido.')
            self.control(identifier,body['enabled'])
            self.state(identifier,'waiting' if body['enabled'] else 'paused','Esperando una lectura actual de Live.' if body['enabled'] else 'Sincronización pausada.',hardError=None,blockedHash=None)
            self.quiet.pop(identifier,None)
            return self.status(identifier)

    def editor(self, identifier, body):
        self.store.load(identifier);client=body.get('clientId','')
        if not ID.fullmatch(client):raise ValueError('Editor inválido.')
        with self.manager.lock:
            key=(identifier,client)
            if body.get('dirty'):self.leases[key]=time.time()+10
            else:self.leases.pop(key,None)
        return {'ok':True}

    def save_editor(self, identifier, body):
        client=body.get('clientId','')
        if not ID.fullmatch(client):raise ValueError('Editor inválido.')
        with self.manager.lock,self.store.lock:
            current=self.store.load(identifier);revision=body.get('expectedRevision')
            if type(revision) is not int or revision<1:raise ValueError('Revisión de editor inválida.')
            base=current if revision==current['revision'] else self.read(self.store.folder(identifier)/'history'/f'{revision:06}.json')
            if base is None:raise Conflict('Falta la versión de origen. Tu edición sigue en pantalla.')
            draft={**base,**{k:v for k,v in body.get('project',{}).items() if k in EDITABLE}}
            validate(draft)
            patch,conflicts=editor_merge(base,draft,current)
            if conflicts:
                token=uuid4().hex;entry={'id':token,'clientId':client,'baseRevision':revision,'draft':draft,'fields':conflicts,'at':time.time()}
                atomic(self.drafts/(token+'.json'),entry);atomic(self.drafts/(identifier+'-active.json'),entry)
                self.state(identifier,'editor-conflict','Tu edición y la versión recibida cambiaron el mismo contenido.',conflicts=conflicts,draftId=token)
                return {'conflict':True,'fields':conflicts,'draftId':token}
            changed=patch and any(current.get(k)!=v for k,v in patch.items())
            if changed:patch['sync_event']={'source':'NANOOK · autoguardado','revision':current['revision']+1,'at':time.time()}
            result=self.save_patch(current,patch) if changed else current
            self.leases.pop((identifier,client),None)
            active=self.read(self.drafts/(identifier+'-active.json'))
            if active and active['clientId']==client:
                (self.drafts/(identifier+'-active.json')).unlink(missing_ok=True)
                self.state(identifier,'waiting','Ediciones compatibles. Retomando la sincronización.',draftId=None,conflicts=[])
            return {'project':result}

    def save_patch(self,p,patch):
        prepared=None;stage=None
        if 'audio_tracks' in patch and patch['audio_tracks']!=p.get('audio_tracks'):
            patch,prepared,stage=self.manager.audio.prepare(p,patch)
        try:return self.store.save(p['id'],patch,p['revision'],prepared)
        finally:
            if stage:
                import shutil
                shutil.rmtree(stage,ignore_errors=True)

    def archive(self, identifier, capture):
        path=self.history/identifier/(capture['captureHash']+'.json')
        if not path.is_file():atomic(path,capture)

    def receive(self, p, capture, live, force=False, source=None):
        identifier=uuid4().hex
        command={'format':'nanook-live-read','action':'read','projectId':p['id'],'projectBpm':p['bpm'],
                 'targetPath':live['setPath'],'targetSession':live['session']}
        job={'id':identifier,'projectId':p['id'],'state':'ready','automatic':True,'createdAt':time.time(),
             'finishedAt':time.time(),'sourceRevision':p['revision'],'command':command,'returnData':capture}
        atomic(self.manager.queue/(identifier+'.json'),job);self.archive(p['id'],capture)
        return self.manager.returns.apply(p['id'],identifier,{'expectedRevision':p['revision'],'notes':True,'structure':True,'audio':True,
            'structureSource':source or self.manager.returns.plan(p,capture)['suggestedSource'] or 'clips',
            'resolveConflicts':'live' if force else None})

    def observation(self, identifier, live):
        o=self.read(self.root/'observations'/(identifier+'.json'))
        if not o or o.get('session')!=live.get('session') or o.get('setPath')!=live.get('setPath') or not 0<=time.time()-o.get('observedAt',0)<5:return None
        return o

    def tick(self, now=None):
        now=time.monotonic() if now is None else now
        m=self.manager
        with m.lock:
            live=m.status()
            ids=set(self.controls)|set(live.get('bindings',[]))
            for identifier in ids:
                try:p=self.store.load(identifier)
                except (OSError,ValueError):continue
                try:self.step(p,live,now)
                except Conflict as e:
                    self.quiet.pop(identifier,None);self.state(identifier,'waiting',str(e))
                except Exception as e:
                    self.state(identifier,'error','La sincronización no pudo completar esta edición. Tus versiones siguen conservadas; revisa el contenido antes de reanudar.',hardError=str(e)[:1200])

    def step(self, p, live, now):
        identifier=p['id'];m=self.manager;control=self.controls.get(identifier,{})
        if not control.get('enabled',True):return
        state=self.states.get(identifier,{})
        if state.get('pending'):
            job=self.read(m.queue/(state['pending']+'.json'))
            if not job or job['state'] in ACTIVE:return
            if job['state']=='complete':
                self.state(identifier,'settling','Cambios incorporados en Ableton.',pending=None,awaitBinding=job['id'],lastDirection='NANOOK → Ableton',lastSyncAt=time.time(),lastRevision=job['sourceRevision'])
            elif job['state'] in {'superseded','expired'} and (job['state']=='superseded' or not job.get('startedAt')):
                self.state(identifier,'waiting','Esperando una lectura actual de Live.',pending=None)
            elif job['state']=='blocked':
                self.state(identifier,'unsupported',job.get('error','Revisa el clip vinculado.'),pending=None,blockedHash=job['command']['captureHash'],blockedLocalHash=job['command']['sourceHash']);return
            else:
                self.state(identifier,'error','La última edición de Live no pudo confirmarse. Revisa o deshaz esa edición antes de reanudar.',pending=None,hardError=job.get('error','Operación interrumpida'))
                return
            state=self.states[identifier];self.quiet.pop(identifier,None)
        if state.get('hardError'):return
        if not live['connected'] or live.get('version','0')<'0.7.0':
            self.state(identifier,'offline','Esperando Live con el puente 0.7 para sincronizar notas, estructura y audio.');return
        if live.get('setPath')!=control.get('setPath') and control.get('setPath'):
            self.state(identifier,'other-set','Abre el Set vinculado para retomar la sincronización.');return
        if live.get('playing') or live.get('recording') or live.get('sessionRecording'):
            self.quiet.pop(identifier,None);self.state(identifier,'transport','Cambios pendientes: se sincronizarán al detener reproducción y grabación.');return
        if any(pid==identifier and expiry>time.time() for (pid,_),expiry in self.leases.items()):
            self.quiet.pop(identifier,None);self.state(identifier,'editing','Guardando tu edición de NANOOK…');return
        draft=self.read(self.drafts/(identifier+'-active.json'))
        if draft:
            self.state(identifier,'editor-conflict','Hay una edición conservada que necesita resolver un conflicto.',conflicts=draft['fields'],draftId=draft['id']);return
        if any(j['state'] in ACTIVE for j in m.jobs()):return
        observation=self.observation(identifier,live)
        if not observation:
            self.state(identifier,'waiting','Esperando una lectura actual del Set.');return
        if observation.get('error'):
            self.state(identifier,'unsupported',observation['error']);return
        capture=observation['capture']
        if state.get('blockedHash')==capture['captureHash'] and state.get('blockedLocalHash')==musical_hash(p):return
        if state.get('blockedHash'):self.state(identifier,'waiting','El clip cambió. Comprobando de nuevo…',blockedHash=None)
        if state.get('awaitBinding') and capture['binding']['jobId']!=state['awaitBinding']:return
        if state.get('awaitBinding'):
            job=self.read(m.queue/(state['awaitBinding']+'.json'))
            if job:m.audio.ack(p,capture,job['command'])
        analysis=m.audio.analysis_change(p)
        if analysis:
            latest,patch=analysis
            patch['sync_event']={'source':'NANOOK · stems del análisis','revision':p['revision']+1,'at':time.time()}
            p=self.save_patch(p,patch);m.audio.analysis_accepted(p,latest)
        if not control or not control.get('setPath'):
            # Only a saved, verified binding with its real common project revision enrolls.
            try:m.returns.baseline(p,capture)
            except (ValueError,Conflict) as e:self.state(identifier,'unsupported',str(e));return
            control=self.control(identifier,True,capture['setPath'])
        signature=hash_json([musical_hash(p),capture['captureHash']])
        previous=self.quiet.get(identifier)
        if not previous or previous[0]!=signature:
            self.quiet[identifier]=(signature,now);self.state(identifier,'settling','Esperando a que termine la edición…',awaitBinding=None);return
        if now-previous[1]<1.2:return
        try:plan=m.returns.plan(p,capture)
        except (ValueError,Conflict) as e:self.state(identifier,'unsupported',str(e));return
        source=plan['suggestedSource'];candidate=plan['structures'].get(source,{})
        conflicts=[r['name'] for r in plan['parts'] if r['conflict']]
        conflicts+=['Audio: '+r['name'] for r in plan['audio']['rows'] if r['conflict']]
        if source is None:conflicts.append('Clips y localizadores con estructuras distintas')
        elif candidate.get('error'):conflicts.append(candidate['error'])
        elif candidate['conflict']:conflicts.append('Estructura')
        if conflicts:
            self.archive(identifier,capture)
            atomic(self.history/(identifier+'-conflict.json'),{'capture':capture,'revision':p['revision']})
            self.state(identifier,'conflict','Ambos lados cambiaron el mismo contenido. Las dos versiones están conservadas.',conflicts=conflicts,captureHash=capture['captureHash']);return
        remote=any(r['changed'] for r in plan['parts']) or candidate['changed'] or any(r['changed'] for r in plan['audio']['rows'])
        harmonize=candidate['changed']
        if remote:
            self.state(identifier,'receiving','Recibiendo notas, estructura y versiones de audio de Ableton…')
            try:p=self.receive(p,capture,live)
            except Conflict as e:
                self.quiet.pop(identifier,None);self.state(identifier,'waiting',str(e));return
            self.state(identifier,'settling','Partitura actualizada y revisión guardada.',lastDirection='Ableton → NANOOK',lastSyncAt=time.time(),lastRevision=p['revision'])
            plan=m.returns.plan(p,capture)
        tracks,sections=self.patches(p,capture,plan,harmonize)
        if not tracks:
            self.state(identifier,'synced','Notas, estructura y audio sincronizados.',conflicts=[],captureHash=None);return
        self.enqueue(p,capture,live,tracks,sections,control)

    def patches(self,p,capture,plan,harmonize=False):
        parts=channel_parts(p);rows={r['id']:r for r in plan['parts']};tracks=[]
        for channel in parts.keys()|rows.keys():
            part=parts.get(channel);row=rows.get(channel)
            if row and not (row['localChanged'] and row['localHash']!=row['liveHash']):continue
            if not row and not part:continue
            notes=part['notes'] if part else []
            tracks.append({'id':channel,'name':(part['name'] if part else plan['base']['notesBase'][channel]['name'])+' · MIDI','kind':'midi','muted':True,
                'notes':[{'pitch':n['pitch'],'beat':n['start']*p['bpm']/60,'beats':n['duration']*p['bpm']/60,'velocity':max(1,min(127,round(n['amplitude']*127)))} for n in notes]})
        sections=sections_for(p);local_structure=hash_json(section_rows(sections))!=plan['base']['projectStructureHash']
        if local_structure or (harmonize and any(v.get('rows')!=section_rows(sections) for v in plan['structures'].values())):
            tracks.append({'id':'structure','name':'Estructura · '+p['title'],'kind':'structure','muted':True})
        audio,bases=self.manager.audio.outgoing(p,capture,plan['audio'])
        for t in audio:t['projectHash']=bases[t['id']]
        return tracks+audio,sections

    def enqueue(self,p,capture,live,tracks,sections,control):
        identifier=p['id'];self.archive(identifier,capture);job_id=uuid4().hex
        command={'format':'nanook-live-transfer','version':1,'action':'sync-music','jobId':job_id,'projectId':identifier,
            'sourceRevision':p['revision'],'sourceHash':musical_hash(p),'targetPath':live['setPath'],'targetSession':live['session'],
            'bpm':p['bpm'],'lengthBeats':p['duration']*p['bpm']/60,'tracks':tracks,'sections':sections,
            'captureHash':capture['captureHash'],'autoGeneration':control['generation'],
            'audioBases':{t['id']:t['projectHash'] for t in tracks if t['kind']=='audio'}}
        job={'id':job_id,'projectId':identifier,'state':'queued','createdAt':time.time(),'expiresAt':time.time()+10,
            'automatic':True,'sourceRevision':p['revision'],'command':command}
        self.state(identifier,'sending','Actualizando notas, estructura y audio en Ableton…',pending=job_id,conflicts=[],captureHash=None)
        atomic(self.manager.queue/(job_id+'.json'),job)

    def resolve(self, identifier, body):
        if body.get('choice') not in {'nanook','live'}:raise ValueError('Elige NANOOK o Ableton para resolver.')
        with self.manager.lock:
            p=self.store.load(identifier)
            if body.get('expectedRevision')!=p['revision']:raise Conflict('La revisión cambió. Revisa el estado actual antes de resolver.')
            draft=self.read(self.drafts/(identifier+'-active.json'))
            if draft:
                if body.get('draftId')!=draft['id']:raise Conflict('La edición conservada cambió. Revisa antes de resolver.')
                if body['choice']=='nanook':
                    base=self.read(self.store.folder(identifier)/'history'/f"{draft['baseRevision']:06}.json") if draft['baseRevision']!=p['revision'] else p
                    patch,_=editor_merge(base,draft['draft'],p,True);p=self.save_patch(p,patch)
                (self.drafts/(identifier+'-active.json')).unlink(missing_ok=True)
                self.leases={k:v for k,v in self.leases.items() if k[0]!=identifier}
            else:
                live=self.manager.status();o=self.observation(identifier,live)
                if not o or 'capture' not in o or o['capture']['captureHash']!=body.get('captureHash'):raise Conflict('Live cambió. Revisa el conflicto actualizado.')
                plan=self.manager.returns.plan(p,o['capture'])
                source=plan['suggestedSource'] or body.get('structureSource')
                if source not in {'clips','locators'}:raise Conflict('Elige clips o localizadores antes de continuar.')
                original=deepcopy(p)
                p=self.receive(p,o['capture'],live,True,source)
                if body['choice']=='nanook':
                    parts=part_map(p);old=part_map(original)
                    for row in plan['parts']:
                        if row['conflict']:
                            if row['id'] in old:parts[row['id']]=old[row['id']]
                            else:parts.pop(row['id'],None)
                    patch={'parts':list(parts.values())}
                    audio={t['id']:t for t in p.get('audio_tracks',[])};old_audio={t['id']:t for t in original.get('audio_tracks',[])}
                    for row in plan['audio']['rows']:
                        if row['conflict']:audio[row['id']]=old_audio[row['id']]
                    if audio:patch['audio_tracks']=list(audio.values())
                    if plan['structures'][source]['conflict']:
                        patch.update(structure=original['structure'],ableton_structure=original.get('ableton_structure',False))
                    patch['sync_event']={'source':'Conflicto resuelto · NANOOK','revision':p['revision']+1,'at':time.time()}
                    p=self.save_patch(p,patch)
            self.state(identifier,'waiting','Conflicto resuelto. Retomando la sincronización.',conflicts=[],draftId=None,captureHash=None,hardError=None)
            self.quiet.pop(identifier,None)
            if not draft:
                next_plan=self.manager.returns.plan(p,o['capture']);tracks,sections=self.patches(p,o['capture'],next_plan,True)
                if tracks:self.enqueue(p,o['capture'],live,tracks,sections,self.controls[identifier])
            return p
