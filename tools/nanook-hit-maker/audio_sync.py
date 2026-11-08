"""Immutable audio versions and three-way Arrangement clip synchronization."""
from copy import deepcopy
import hashlib
import json
import math
import mimetypes
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from uuid import uuid4

from store import atomic, Conflict, finite, sha256_file

ROLES={'ableton-audio-source','ableton-audio-preview'}
EXT={'.wav','.aif','.aiff','.flac','.mp3','.m4a','.aac','.ogg'}


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,allow_nan=False).encode()).hexdigest()


def canonical(track, assets):
    return {'id':track['id'],'name':track['name'],'clips':[
        {'sha256':assets[c['assetId']]['sha256'],'name':c['name'],
         **{k:round(c[k],3) for k in ('start','offset','duration')},
         'gainDb':round(c['gainDb'],1),'pitch':int(c['pitch']),'fine':round(c['fine']), 'muted':c['muted']}
        for c in track['clips']]}


def validate_tracks(tracks, assets):
    if not isinstance(tracks,list) or len(tracks)>24:raise ValueError('Máximo 24 pistas de audio vinculadas.')
    ids=set();count=0
    for t in tracks:
        if not isinstance(t,dict) or not re.fullmatch('a-[a-f0-9]{12}',t.get('id','')) or t['id'] in ids:raise ValueError('Identidad de audio inválida o duplicada.')
        ids.add(t['id'])
        if not isinstance(t.get('name'),str) or not 1<=len(t['name'])<=100:raise ValueError('Escribe un nombre para la pista de audio.')
        if not isinstance(t.get('clips'),list):raise ValueError('Clips de audio inválidos.')
        count+=len(t['clips'])
        if count>64:raise ValueError('Máximo 64 clips de audio vinculados por canción.')
        for c in t['clips']:
            a=assets.get(c.get('assetId'))
            if not a or not a['mime'].startswith('audio/'):raise ValueError('Falta el archivo de un clip de audio.')
            if not isinstance(c.get('name'),str) or not 1<=len(c['name'])<=100:raise ValueError('Escribe un nombre para el clip de audio.')
            for k,lo,hi in [('start',0,1800),('offset',0,1800),('duration',.001,1800),('gainDb',-120,24),('pitch',-48,48),('fine',-50,49)]:
                if not finite(c.get(k),lo,hi):raise ValueError('Hay ajustes de audio fuera de rango: '+k)
            if c['start']+c['duration']>1800.0001 or int(c['pitch'])!=c['pitch'] or type(c.get('muted')) is not bool:raise ValueError('El clip de audio supera los límites de la canción.')
        ordered=sorted(t['clips'],key=lambda c:c['start'])
        if ordered!=t['clips'] or any(a['start']+a['duration']>b['start']+.001 for a,b in zip(ordered,ordered[1:])):raise ValueError('Los clips de una pista no pueden superponerse. Usa otra pista para mezclarlos.')


class AudioSync:
    def __init__(self,manager):
        self.manager=manager;self.store=manager.store;self.path=manager.root/'audio-state.json'
        try:self.states=json.loads(self.path.read_text())
        except (OSError,ValueError):self.states={}
        self.cache={}

    def media(self,path):
        path=Path(path).resolve();stat=path.stat();stamp=(str(path),stat.st_dev,stat.st_ino,stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns)
        if not path.is_file() or path.suffix.lower() not in EXT or not 0<stat.st_size<=1024**3:raise ValueError('Falta una muestra válida de Live o supera 1 GB.')
        if stamp not in self.cache:
            h=hashlib.sha256()
            with path.open('rb') as f:
                while chunk:=f.read(1024**2):h.update(chunk)
            probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,sample_rate,channels','-of','json',str(path)],capture_output=True,text=True,timeout=45)
            if probe.returncode:raise ValueError('No pude verificar una muestra de Live como audio.')
            info=json.loads(probe.stdout);duration=float(info.get('format',{}).get('duration','nan'))
            streams=[s for s in info.get('streams',[]) if s.get('codec_type')=='audio']
            if not streams or not finite(duration,.001,1800):raise ValueError('La muestra debe durar entre 1 ms y 30 minutos.')
            after=path.stat()
            if stamp[2:]!=(after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise Conflict('La muestra cambió mientras se verificaba. Se leerá de nuevo.')
            self.cache[stamp]={'sha256':h.hexdigest(),'duration':duration,'size':stat.st_size,'path':str(path),'sampleRate':int(streams[0]['sample_rate']),'stamp':list(stamp)}
            if len(self.cache)>512:self.cache={stamp:self.cache[stamp]}
        return self.cache[stamp]

    def native(self,capture):
        tracks={}
        for t in capture.get('audio',[]):
            if t.get('error'):raise ValueError(t['error'])
            clips=[]
            for c in t['clips']:
                if c.get('warp') or c.get('loop'):raise ValueError('El audio con Warp o bucle requiere consolidar una versión sin Warp para sincronizarlo. El original sigue en Live.')
                media=self.media(c['file']);rate=2**((c['pitch']+c['fine']/100)/12)
                if c['offset']+c['duration']*rate>media['duration']+.02:raise ValueError('Un recorte de audio supera su archivo de origen.')
                clips.append({k:c[k] for k in ('name','start','offset','duration','gainDb','pitch','fine','muted')}|{'sha256':media['sha256'],'media':media})
            value={'id':t['id'],'name':t['name'],'clips':clips}
            # Canonical hashes are independent of mutable paths and Live's float precision.
            clean={'id':t['id'],'name':t['name'],'clips':[{k:(round(v,3) if k in {'start','offset','duration'} else round(v,1) if k=='gainDb' else round(v) if k=='fine' else v) for k,v in c.items() if k!='media'} for c in clips]}
            tracks[t['id']]={'value':value,'hash':digest(clean)}
        return tracks

    def plan(self,p,capture):
        if 'audio' not in capture:return {'rows':[],'native':{},'initial':False}
        remote=self.native(capture);assets={a['id']:a for a in p['assets']};local={t['id']:t for t in p.get('audio_tracks',[])}
        state=self.states.get(p['id'],{})
        if state.get('setPath')!=capture['setPath']:state={'setPath':capture['setPath'],'base':{}}
        initial='audio_tracks' not in p
        if initial:state['analysisId']=p.get('analysis_run',{}).get('id')
        rows=[]
        for key in dict.fromkeys([*local,*remote]):
            l=local.get(key);r=remote.get(key)
            if r is None:
                if key in state.get('base',{}):raise Conflict('Falta una pista de audio vinculada. Recupera su etiqueta NHM; vaciar clips conserva la pista.')
                rows.append({'id':key,'name':l['name'],'changed':False,'localChanged':True,'conflict':False,'localHash':digest(canonical(l,assets)),'liveHash':None});continue
            lh=digest(canonical(l,assets)) if l else None;rh=r['hash'];base=state.get('base',{}).get(key)
            if lh==rh:
                state.setdefault('base',{})[key]={'project':lh,'live':rh};changed=False;local_changed=False;conflict=False
            elif initial or base is None:
                changed=l is None;local_changed=l is not None;conflict=False
            else:
                changed=rh!=base['live'];local_changed=lh!=base['project'];conflict=changed and local_changed
            rows.append({'id':key,'name':(l or r['value'])['name'],'changed':changed,'localChanged':local_changed,'conflict':conflict,'localHash':lh,'liveHash':rh})
        # New local audio tracks are allowed, without silently adopting untagged Live tracks.
        self.states[p['id']]=state;atomic(self.path,self.states)
        return {'rows':rows,'native':remote,'initial':initial}

    def accept(self,p,capture,rows):
        state=self.states.setdefault(p['id'],{'setPath':capture['setPath'],'base':{}});assets={a['id']:a for a in p['assets']};local={t['id']:t for t in p.get('audio_tracks',[])}
        for row in rows:
            if row['changed'] or row['localHash']==row['liveHash']:
                state.setdefault('base',{})[row['id']]={'project':digest(canonical(local[row['id']],assets)),'live':row['liveHash']}
        atomic(self.path,self.states)

    def ack(self,p,capture,command):
        expected=command.get('audioBases',{})
        if not expected:return
        remote=self.native(capture);state=self.states.setdefault(p['id'],{'setPath':capture['setPath'],'base':{}})
        for key,project_hash in expected.items():state.setdefault('base',{})[key]={'project':project_hash,'live':remote[key]['hash']}
        atomic(self.path,self.states)

    def prepare(self,p,patch,remote=None):
        """Stage immutable source/preview files; commit them with one project revision."""
        candidate={**p,**patch};assets=deepcopy(p['assets']);by_id={a['id']:a for a in assets};by_sha={a['sha256']:a for a in assets if a['mime'].startswith('audio/')};files=[]
        wanted={c['assetId'] for t in candidate.get('audio_tracks',[]) for c in t['clips']} - by_id.keys()
        if wanted:
            for history in sorted((self.store.folder(p['id'])/'history').glob('*.json'),reverse=True):
                old=json.loads(history.read_text())
                for a in old['assets']:
                    if a['id'] in wanted:
                        assets.append(a);by_id[a['id']]=a;by_sha[a['sha256']]=a;wanted.remove(a['id'])
                if not wanted:break
            if wanted:raise ValueError('Falta una versión de audio citada por la edición.')
        stage=Path(tempfile.mkdtemp(prefix='audio-',dir=self.manager.root))
        def asset(path,name,role):
            media=self.media(path);old=by_sha.get(media['sha256'])
            if old:return old
            token=uuid4().hex;filename=token+Path(path).suffix.lower();dest=stage/filename;shutil.copyfile(path,dest)
            if sha256_file(dest)!=media['sha256']:raise Conflict('Una muestra cambió durante la copia. Su versión anterior se conserva.')
            a={'id':token,'file':filename,'name':name[:250],'mime':mimetypes.guess_type(filename)[0] or 'audio/wav','sha256':media['sha256'],'size':dest.stat().st_size,'duration':media['duration'],'role':role}
            assets.append(a);by_id[token]=a;by_sha[a['sha256']]=a;files.append((dest,a));return a
        try:
            tracks=deepcopy(candidate.get('audio_tracks',[]))
            if remote:
                local={t['id']:t for t in tracks}
                for key,r in remote.items():
                    value=deepcopy(r['value']);old=local.get(key,{})
                    value['stemName']=old.get('stemName',value['name'])
                    for c in value['clips']:
                        m=c.pop('media');c.pop('sha256');c['assetId']=asset(m['path'],value['name']+' · Live'+Path(m['path']).suffix,'ableton-audio-source')['id']
                    if any(by_id[c['assetId']].get('role')=='analysis-stem' for c in value['clips']):value['stemOrigin']='analysis'
                    local[key]=value
                tracks=list(local.values())
            validate_tracks(tracks,by_id)
            previous={t['id']:t for t in p.get('audio_tracks',[])}
            for t in tracks:
                for c in t['clips']:
                    a=by_id[c['assetId']];source=next((path for path,x in files if x['id']==a['id']),self.store.folder(p['id'])/'assets'/a['file']);m=self.media(source)
                    if a.get('role')=='ableton-audio-source' and re.match('[a-f0-9]{64}',a['name']):a['name']=t['name']+' · Live'+Path(a['file']).suffix
                    if m['sha256']!=a['sha256']:raise ValueError('Una muestra de NANOOK cambió fuera del historial. Restaura una versión válida.')
                    if c['offset']+c['duration']*2**((c['pitch']+c['fine']/100)/12)>m['duration']+.02:raise ValueError('El recorte supera la duración de la muestra.')
                old=previous.get(t['id'])
                if old and canonical(old,{a['id']:a for a in p['assets']})==canonical(t,by_id) and old.get('previewAssetId') in by_id:t['previewAssetId']=old['previewAssetId'];continue
                if not t['clips']:t.pop('previewAssetId',None);continue
                c=t['clips'][0];a=by_id[c['assetId']]
                if len(t['clips'])==1 and c['start']==0 and c['offset']==0 and c['pitch']==0 and c['fine']==0 and c['gainDb']==0 and not c['muted'] and abs(c['duration']-a.get('duration',-1))<.002:
                    t['previewAssetId']=a['id'];continue
                target=stage/(uuid4().hex+'.wav');args=['ffmpeg','-v','error','-nostdin','-y'];filters=[];labels=[]
                for i,c in enumerate(t['clips']):
                    a=by_id[c['assetId']];source=next((path for path,x in files if x['id']==a['id']),self.store.folder(p['id'])/'assets'/a['file']);rate=2**((c['pitch']+c['fine']/100)/12)
                    args+=['-i',str(source)];label=f'c{i}';labels.append('['+label+']')
                    filters.append(f'[{i}:a]atrim=start={c["offset"]:.9f}:duration={c["duration"]*rate:.9f},asetpts=PTS-STARTPTS,aresample=48000,asetrate={48000*rate:.9f},aresample=48000,volume={0 if c["muted"] or c["gainDb"]<=-120 else 10**(c["gainDb"]/20):.9f},apad,atrim=duration={c["duration"]:.9f},adelay={round(c["start"]*1000)}:all=1[{label}]')
                filters.append(''.join(labels)+f'amix=inputs={len(labels)}:normalize=0:duration=longest[out]')
                run=subprocess.run(args+['-filter_complex',';'.join(filters),'-map','[out]','-ac','2','-c:a','pcm_s24le',str(target)],capture_output=True,timeout=180)
                if run.returncode:raise ValueError('No se pudo preparar la escucha del stem. La versión anterior sigue conservada.')
                t['previewAssetId']=asset(target,t['name']+' · escucha.wav','ableton-audio-preview')['id']
            needed={c['assetId'] for t in tracks for c in t['clips']}|{t['previewAssetId'] for t in tracks if t.get('previewAssetId')}
            assets=[a for a in assets if a.get('role') not in ROLES or a['id'] in needed]
            patch={**patch,'audio_tracks':tracks,'duration':max([candidate['duration'],*[c['start']+c['duration'] for t in tracks for c in t['clips']]])}
            return patch,(assets,files),stage
        except Exception:
            shutil.rmtree(stage,ignore_errors=True);raise

    def outgoing(self,p,capture,plan):
        target=Path(capture['setPath']).parent/'Samples/NANOOK'/p['id'];target.mkdir(parents=True,exist_ok=True)
        local={t['id']:t for t in p.get('audio_tracks',[])};assets={a['id']:a for a in p['assets']};tracks=[];bases={}
        for row in plan['rows']:
            if not row['localChanged'] or row['localHash']==row['liveHash']:continue
            t=local.get(row['id'],{'id':row['id'],'name':row['name'],'clips':[]});r=plan['native'].get(t['id'],{}).get('value',{});clips=[]
            for i,c in enumerate(t['clips']):
                a=assets[c['assetId']];src=self.store.folder(p['id'])/'assets'/a['file'];m=self.media(src)
                if m['sha256']!=a['sha256']:raise ValueError('La integridad de la muestra no coincide con el historial.')
                dst=target/(a['sha256']+src.suffix)
                if not dst.is_file() or self.media(dst)['sha256']!=a['sha256']:
                    temp=dst.with_suffix('.copying');shutil.copyfile(src,temp)
                    if sha256_file(temp)!=a['sha256']:raise ValueError('La copia de la muestra no coincide.')
                    temp.replace(dst)
                reuse=i if i<len(r.get('clips',[])) and r['clips'][i]['sha256']==a['sha256'] else None
                clips.append({k:c[k] for k in ('name','start','offset','duration','gainDb','pitch','fine','muted')}|{'file':str(dst),'reuse':reuse})
            tracks.append({'id':t['id'],'name':t['name'],'kind':'audio','clips':clips,'muted':False});bases[t['id']]=row['localHash']
        return tracks,bases

    def analysis_change(self,p):
        state=self.states.get(p['id'],{});latest=p.get('analysis_run',{}).get('id')
        if 'audio_tracks' not in p or not latest or latest==state.get('analysisId'):return None
        selected=[a for a in p['assets'] if a.get('jobId')==latest and a.get('role')=='analysis-stem' and not a['name'].startswith(('A -','Bajo sintetizado'))]
        tracks=deepcopy(p['audio_tracks']);known={t.get('stemName'):t for t in tracks if t.get('stemOrigin')=='analysis'}
        for a in selected:
            t=known.get(a['name'])
            if t is None:
                t={'id':'a-'+digest([a['name'],0])[:12],'name':a['name'][:100],'stemName':a['name'],'stemOrigin':'analysis','clips':[]}
                if any(old['id']==t['id'] for old in tracks):raise Conflict('Un stem nuevo coincide con la identidad de otra pista de audio. Conserva ambas antes de vincularlo.')
                tracks.append(t)
            t['clips']=[{'assetId':a['id'],'name':a['name'][:100],'start':0,'offset':0,'duration':a['duration'],'gainDb':0,'pitch':0,'fine':0,'muted':False}]
        for name,t in known.items():
            if name not in {a['name'] for a in selected}:t['clips']=[]
        return latest,{'audio_tracks':tracks}

    def analysis_accepted(self,p,latest):
        self.states.setdefault(p['id'],{}).update(analysisId=latest);atomic(self.path,self.states)
