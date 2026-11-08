"""NANOOK HIT MAKER Control Surface. Shared local files, no MIDI ports needed."""
import json
from pathlib import Path
import time
from uuid import uuid4
import Live
from _Framework.ControlSurface import ControlSurface
from . import engine


def create_instance(c_instance):
    return NanookHitMaker(c_instance)


class NanookHitMaker(ControlSurface):
    def __init__(self, c_instance):
        super(NanookHitMaker, self).__init__(c_instance)
        config = json.loads((Path(__file__).parent / 'config.json').read_text())
        self.root = Path(config['bridgeRoot']).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / 'queue').mkdir(exist_ok=True)
        self.session = uuid4().hex
        self.last_tick = 0
        self.last_observe = 0
        (self.root / 'observations').mkdir(exist_ok=True)
        self.finished_files = set()
        self.log_message('NANOOK bridge %s ready' % engine.VERSION)
        self.show_message('NANOOK HIT MAKER conectado')

    def status(self):
        song = self.song()
        app = Live.Application.get_application()
        return {'version': engine.VERSION, 'session': self.session, 'timestamp': time.time(),
                'setName': song.name or 'Set sin guardar', 'setPath': song.file_path,
                'tempo': song.tempo, 'playing': song.is_playing, 'recording': song.record_mode,
                'sessionRecording':song.session_record,
                'trackCount': len(song.tracks), 'arrangementClips': sum(len(t.arrangement_clips) for t in song.tracks),
                'liveVersion': '%s.%s.%s' % (app.get_major_version(), app.get_minor_version(), app.get_bugfix_version()),
                'bindings': sorted({m[1] for t in song.tracks for m in [engine.TAG.search(t.name)] if m})}

    def observe(self):
        if time.time()-self.last_observe<1:return
        self.last_observe=time.time();song=self.song()
        if song.is_playing or song.record_mode or song.session_record:return
        projects=sorted({m[1] for t in song.tracks for m in [engine.TAG.search(t.name)] if m})
        for project in projects:
            data={'projectId':project,'session':self.session,'setPath':song.file_path,'observedAt':time.time()}
            try:data['capture']=engine.read_song(song,engine.read_command(song,project,self.session),self.session)
            except Exception as error:data['error']=str(error)[:1200]
            engine.atomic(self.root/'observations'/(project+'.json'),data)

    def update_display(self):
        super(NanookHitMaker, self).update_display()
        if time.time() - self.last_tick < .2:
            return
        self.last_tick = time.time()
        try:
            engine.atomic(self.root / 'heartbeat.json', self.status())
            busy=False
            for file in sorted((self.root / 'queue').glob('*.json')):
                if file.name in self.finished_files:continue
                job = json.loads(file.read_text())
                if job.get('state') == 'locators':
                    busy=True
                    try:
                        engine.cue_step(self.song(), job['command'], job, self.session)
                    except Exception as error:
                        job.update(state='error', error=str(error)[:1200], finishedAt=time.time())
                    engine.atomic(file, job)
                    break
                if job.get('state') == 'verifying':
                    busy=True
                    try:
                        job.update(**engine.finish(self.song(), job['command'], job), finishedAt=time.time())
                        self.show_message('NANOOK: canción incorporada al Set')
                    except Exception as error:
                        job.update(state='error', error=str(error)[:1200], finishedAt=time.time())
                    engine.atomic(file, job)
                    break
                if job.get('state') == 'verifying-sync':
                    busy=True
                    try:job.update(**engine.finish_music(self.song(),job['command'],job,self.session),finishedAt=time.time())
                    except Exception as error:job.update(state='error',error=str(error)[:1200],finishedAt=time.time())
                    engine.atomic(file,job);break
                if job.get('state') != 'queued':
                    self.finished_files.add(file.name);continue
                if time.time() > job['expiresAt']:
                    job.update(state='expired', error='La entrega caducó antes de que Live la recibiera. Vuelve a enviar.');engine.atomic(file, job);continue
                job.update(state='running', startedAt=time.time());engine.atomic(file, job)
                busy=True
                try:
                    # Resolve again immediately before applying: saved Set and session must still match.
                    if job['command'].get('action') in {'read', 'verify-read'}:
                        data = engine.read_song(self.song(), job['command'], self.session)
                        if job['command']['action'] == 'verify-read':
                            if data['captureHash'] != job['command']['captureHash']:
                                raise ValueError('Live cambió después de la vista previa. Lee los cambios otra vez antes de aplicar.')
                            result = {'state': 'complete', 'captureHash': data['captureHash']}
                        else:
                            result = {'state': 'ready', 'returnData': data}
                    elif job['command'].get('action')=='sync-music':
                        control=json.loads((self.root/'auto-control.json').read_text()).get(job['projectId'],{})
                        if not control.get('enabled') or control.get('generation')!=job['command'].get('autoGeneration') or control.get('setPath')!=self.song().file_path:
                            result={'state':'superseded','error':'Sincronización pausada o vínculo cambiado; no se editó Live.'}
                        else:result=engine.apply_music(self.song(),job['command'],self.session)
                    else:
                        result = engine.apply(self.song(), job['command'], self.session)
                    job.update(**result, finishedAt=time.time())
                    message = 'lectura lista en NANOOK' if job['state'] == 'ready' else 'lectura confirmada' if job['command'].get('action') == 'verify-read' else 'entrega incorporada' if job['state'] == 'complete' else 'revisar cambios en Live'
                    self.show_message('NANOOK: %s' % message)
                except engine.SyncPreflight as error:
                    job.update(state='blocked',error=str(error)[:1200],finishedAt=time.time())
                except Exception as error:
                    job.update(state='error', error=str(error)[:1200], finishedAt=time.time())
                    self.log_message('NANOOK transfer failed: %s' % str(error))
                engine.atomic(file, job)
                engine.atomic(self.root / 'heartbeat.json', self.status())
                break
            if not busy:self.observe()
        except Exception as error:
            self.log_message('NANOOK bridge: %s' % str(error))

    def disconnect(self):
        try:
            engine.atomic(self.root / 'heartbeat.json', {'session': self.session, 'timestamp': 0, 'disconnected': True})
        finally:
            super(NanookHitMaker, self).disconnect()
