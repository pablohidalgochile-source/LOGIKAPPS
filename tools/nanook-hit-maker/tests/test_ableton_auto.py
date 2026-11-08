from copy import deepcopy
import json
import threading
import time
from types import SimpleNamespace as NS
import unittest

import test_ableton as fixtures
from ableton import AbletonManager, channel_parts
from ableton_auto import ACTIVE
from store import atomic, Conflict

engine=fixtures.engine


def append_notes(clip, notes):
    last=max((n.note_id for n in clip.notes),default=0)
    for i,n in enumerate(notes):
        clip.notes.append(NS(pitch=n['pitch'],start_time=n['beat'],duration=n['beats'],velocity=n['velocity'],
            mute=False,probability=1,velocity_deviation=0,note_id=last+i+1))


class AutoTests(unittest.TestCase):
    command=fixtures.AbletonTests.command
    deliver=fixtures.AbletonTests.deliver

    def setUp(self):
        fixtures.AbletonTests.setUp(self)
        self.p=self.store.save(self.p['id'],{'parts':self.p['parts']+[{'key':'melody','name':'Melodía','notes':[{'pitch':60,'start':0,'duration':1,'amplitude':.8}]}]},self.p['revision'])
        self.body['expectedRevision']=self.p['revision'];command=self.command();self.song=fixtures.Song(self.target)
        result=self.deliver(self.song,command);file=self.manager.queue/(command['jobId']+'.json');job=json.loads(file.read_text());job.update(result);atomic(file,job)
        linked=engine.owned(self.song,self.p['id']);self.channels=list(channel_parts(self.p));self.bass=linked[self.channels[0]];self.melody=linked[self.channels[1]]
        self.clock=0;self.end=threading.Event();self.pump_paused=False
        self.pump=threading.Thread(target=self.native,daemon=True);self.pump.start()
        self.publish();self.settle();self.p=self.store.load(self.p['id'])

    def tearDown(self):
        self.end.set();self.pump.join();self.manager.auto.close();fixtures.AbletonTests.tearDown(self)

    def publish_heartbeat(self):
        atomic(self.manager.root/'heartbeat.json',{**self.heartbeat,'timestamp':time.time(),'version':'0.7.0','bindings':[self.p['id']],
            'playing':self.song.is_playing,'recording':self.song.record_mode,'sessionRecording':self.song.session_record,'tempo':self.song.tempo})

    def publish(self):
        self.publish_heartbeat()
        data=engine.read_song(self.song,engine.read_command(self.song,self.p['id'],'test-session'),'test-session')
        atomic(self.manager.root/'observations'/(self.p['id']+'.json'),{'projectId':self.p['id'],'session':'test-session','setPath':str(self.target),'observedAt':time.time(),'capture':data})

    def native(self):
        while not self.end.wait(.01):
            if self.pump_paused:continue
            for file in self.manager.queue.glob('*.json'):
                j=json.loads(file.read_text())
                if j['state']!='queued':continue
                command=j['command'];j.update(state='running',startedAt=time.time());atomic(file,j)
                try:
                    if command.get('action')=='verify-read':
                        data=engine.read_song(self.song,command,'test-session')
                        if data['captureHash']!=command['captureHash']:raise ValueError('Live cambió después de la vista previa.')
                        result={'state':'complete'}
                    elif command.get('action')=='sync-music':
                        control=json.loads(self.manager.auto.control_path.read_text())[self.p['id']]
                        if not control['enabled'] or control['generation']!=command['autoGeneration']:result={'state':'superseded'}
                        else:
                            result=engine.apply_music(self.song,command,'test-session',append_notes)
                            for _ in range(2000):
                                if result['state']!='locators':break
                                engine.cue_step(self.song,command,result,'test-session')
                            if result['state']=='verifying-sync':result=engine.finish_music(self.song,command,result,'test-session')
                    else:continue
                    j.update(result,finishedAt=time.time())
                except engine.SyncPreflight as e:j.update(state='blocked',error=str(e))
                except Exception as e:j.update(state='error',error=str(e))
                atomic(file,j)

    def settle(self):
        self.publish();self.clock+=2;self.manager.auto.tick(self.clock)
        self.publish();self.clock+=2;self.manager.auto.tick(self.clock)

    def drain(self):
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            if not any(j['state'] in ACTIVE for j in self.manager.jobs()):break
            time.sleep(.01)
        self.settle()

    def local(self,index,pitch):
        p=self.store.load(self.p['id']);draft=deepcopy(p);draft['parts'][index]['notes'][0]['pitch']=pitch
        return self.manager.auto.save_editor(p['id'],{'clientId':'a'*32,'expectedRevision':p['revision'],'project':draft})['project']

    def test_live_burst_creates_one_revision_and_no_echo_history_churn(self):
        revision=self.store.load(self.p['id'])['revision']
        self.bass.arrangement_clips[0].notes[0].pitch=38;self.settle()
        p=self.store.load(self.p['id']);self.assertEqual(p['revision'],revision+1);self.assertEqual(p['parts'][0]['notes'][0]['pitch'],38)
        self.assertEqual(p['assets'],self.p['assets']);self.assertIn('Ableton',self.store.history(p['id'])[0]['source'])
        for _ in range(4):self.settle()
        self.assertEqual(self.store.load(p['id'])['revision'],p['revision']);self.assertEqual(self.manager.auto.status(p['id'])['state'],'synced')

    def test_local_edit_updates_note_id_in_place_without_touching_stems_or_other_clips(self):
        clip=self.bass.arrangement_clips[0];note=clip.notes[0];note.expression='MPE existente'
        audio=next(t for k,t in engine.owned(self.song,self.p['id']).items() if k.startswith('a-')).arrangement_clips[0]
        melody=self.melody.arrangement_clips[0];self.bass.devices=['Operator'];self.bass.volume=.42
        p=self.local(0,40);self.settle();self.drain()
        self.assertIs(self.bass.arrangement_clips[0],clip);self.assertIs(clip.notes[0],note);self.assertEqual(note.pitch,40);self.assertEqual(note.expression,'MPE existente')
        self.assertIs(self.melody.arrangement_clips[0],melody);self.assertIs(next(t for k,t in engine.owned(self.song,p['id']).items() if k.startswith('a-')).arrangement_clips[0],audio)
        self.assertEqual(self.bass.devices,['Operator']);self.assertEqual(self.bass.volume,.42)
        self.assertEqual(self.store.load(p['id'])['revision'],p['revision']);self.assertEqual(self.manager.auto.status(p['id'])['state'],'synced')

    def test_changes_in_different_parts_merge_in_both_directions(self):
        self.bass.arrangement_clips[0].notes[0].pitch=38;p=self.local(1,64);self.settle();self.drain()
        result=self.store.load(p['id']);self.assertEqual([x['notes'][0]['pitch'] for x in result['parts']],[38,64])
        self.assertEqual(self.melody.arrangement_clips[0].notes[0].pitch,64)
        jobs=[j for j in self.manager.jobs() if j['command'].get('action')=='sync-music']
        self.assertEqual([t['id'] for t in jobs[-1]['command']['tracks']],[self.channels[1]])
        self.assertEqual(result['revision'],p['revision']+1)

    def test_same_part_conflict_keeps_both_versions_and_resolves_to_nanook(self):
        self.bass.arrangement_clips[0].notes[0].pitch=38;p=self.local(0,40);self.settle()
        state=self.manager.auto.status(p['id']);self.assertEqual(state['state'],'conflict');self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,38)
        self.manager.auto.resolve(p['id'],{'choice':'nanook','expectedRevision':p['revision'],'captureHash':state['captureHash']});self.drain()
        self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,40)
        revisions=[json.loads(f.read_text()) for f in (self.store.folder(p['id'])/'history').glob('*.json')]
        self.assertTrue(any(r['parts'][0]['notes'][0]['pitch']==38 for r in revisions));self.assertTrue(any(r['parts'][0]['notes'][0]['pitch']==40 for r in revisions))

    def test_structure_conflict_choice_harmonizes_clips_and_locators_once(self):
        structure=engine.owned(self.song,self.p['id'])['structure'];structure.arrangement_clips[1].name='Puente'
        self.song.cue_points[1].name='Drop '+engine.tag(self.p['id'],'cue');self.settle()
        state=self.manager.auto.status(self.p['id']);self.assertEqual(state['state'],'conflict')
        p=self.manager.auto.resolve(self.p['id'],{'choice':'live','expectedRevision':state['revision'],'captureHash':state['captureHash'],'structureSource':'clips'});self.drain()
        self.assertEqual(p['structure'][1]['name'],'Puente');self.assertEqual(structure.arrangement_clips[1].name,'Puente')
        self.assertTrue(self.song.cue_points[1].name.startswith('Puente '));revision=p['revision'];self.settle()
        self.assertEqual(self.store.load(p['id'])['revision'],revision)

    def test_editor_lease_and_playback_queue_changes_until_safe(self):
        self.manager.auto.editor(self.p['id'],{'clientId':'a'*32,'dirty':True});self.bass.arrangement_clips[0].notes[0].pitch=38;self.settle()
        self.assertEqual(self.store.load(self.p['id'])['revision'],self.p['revision'])
        self.manager.auto.editor(self.p['id'],{'clientId':'a'*32,'dirty':False});self.song.is_playing=True;self.publish_heartbeat();self.manager.auto.tick(self.clock+2)
        self.assertEqual(self.manager.auto.status(self.p['id'])['state'],'transport');self.song.is_playing=False;self.settle()
        self.assertEqual(self.store.load(self.p['id'])['parts'][0]['notes'][0]['pitch'],38)

    def test_editor_rebase_preserves_other_part_and_retains_conflicting_draft_after_restart(self):
        base=self.store.load(self.p['id']);self.bass.arrangement_clips[0].notes[0].pitch=38;self.settle()
        draft=deepcopy(base);draft['parts'][1]['notes'][0]['pitch']=64
        result=self.manager.auto.save_editor(base['id'],{'clientId':'a'*32,'expectedRevision':base['revision'],'project':draft})
        self.assertEqual([p['notes'][0]['pitch'] for p in result['project']['parts']],[38,64])
        draft['parts'][0]['notes'][0]['pitch']=40
        conflict=self.manager.auto.save_editor(base['id'],{'clientId':'a'*32,'expectedRevision':base['revision'],'project':draft});self.assertTrue(conflict['conflict'])
        self.manager=AbletonManager(self.store);self.settle();state=self.manager.auto.status(base['id']);self.assertEqual(state['state'],'editor-conflict')
        p=self.manager.auto.resolve(base['id'],{'choice':'nanook','expectedRevision':state['revision'],'draftId':state['draftId']})
        self.assertEqual(p['parts'][0]['notes'][0]['pitch'],40);self.assertTrue((self.manager.auto.drafts/(state['draftId']+'.json')).is_file())

    def test_pausing_cancels_unstarted_job_and_resume_does_not_duplicate_it(self):
        self.pump_paused=True;p=self.local(0,40);self.settle();pending=self.manager.auto.states[p['id']]['pending']
        self.manager.auto.configure(p['id'],{'enabled':False});self.pump_paused=False;self.drain()
        job=json.loads((self.manager.queue/(pending+'.json')).read_text());self.assertEqual(job['state'],'superseded');self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,36)
        self.manager.auto.configure(p['id'],{'enabled':True});self.settle();self.drain();self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,40)
        self.assertEqual(self.store.load(p['id'])['revision'],p['revision'])

    def test_unsupported_clip_is_untouched(self):
        self.bass.arrangement_clips[0].start_time=1;self.settle();self.local(0,40);self.settle();self.drain()
        self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,36);self.assertEqual(self.manager.auto.status(self.p['id'])['state'],'unsupported')

    def test_correcting_local_edit_unblocks_without_changing_live(self):
        self.bass.arrangement_clips[0].start_time=1;self.settle();self.local(0,40);self.settle();self.drain()
        count=len(list(self.manager.queue.glob('*.json')))
        self.local(0,36);self.settle();self.drain()
        self.assertEqual(self.manager.auto.status(self.p['id'])['state'],'synced')
        self.assertEqual(len(list(self.manager.queue.glob('*.json'))),count)

    def test_unrepresentable_live_note_stops_without_creating_repeated_jobs(self):
        revision=self.store.load(self.p['id'])['revision']
        self.bass.arrangement_clips[0].notes[0].duration=.0001
        self.settle();state=self.manager.auto.status(self.p['id'])
        self.assertEqual(state['state'],'error');self.assertTrue(state['hardError'])
        count=len(list(self.manager.queue.glob('*.json')))
        for _ in range(3):self.settle()
        self.assertEqual(len(list(self.manager.queue.glob('*.json'))),count)
        self.assertEqual(self.store.load(self.p['id'])['revision'],revision)

    def test_partial_native_failure_never_retries(self):
        def fail(_):raise RuntimeError('Fallo después de empezar')
        self.bass.arrangement_clips[0].apply_note_modifications=fail
        self.local(0,40);self.settle();self.drain();state=self.manager.auto.status(self.p['id']);self.assertEqual(state['state'],'error')
        count=len(list(self.manager.queue.glob('*.json')));self.settle();self.assertEqual(len(list(self.manager.queue.glob('*.json'))),count)

    def test_restart_after_native_delivery_does_not_replay_or_create_revisions(self):
        p=self.local(0,40);self.settle();pending=self.manager.auto.states[p['id']]['pending']
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            if json.loads((self.manager.queue/(pending+'.json')).read_text())['state']=='complete':break
            time.sleep(.01)
        count=len(list(self.manager.queue.glob('*.json')));self.manager=AbletonManager(self.store);self.settle()
        self.assertEqual(self.manager.auto.status(p['id'])['state'],'synced');self.assertEqual(len(list(self.manager.queue.glob('*.json'))),count)
        self.assertEqual(self.store.load(p['id'])['revision'],p['revision'])

    def test_live_edit_after_enqueue_supersedes_write_and_becomes_conflict(self):
        self.pump_paused=True;p=self.local(0,40);self.settle();pending=self.manager.auto.states[p['id']]['pending']
        self.bass.arrangement_clips[0].notes[0].pitch=38;self.pump_paused=False;self.drain()
        self.assertEqual(json.loads((self.manager.queue/(pending+'.json')).read_text())['state'],'superseded')
        self.assertEqual(self.bass.arrangement_clips[0].notes[0].pitch,38);self.assertEqual(self.store.load(p['id'])['parts'][0]['notes'][0]['pitch'],40)
        self.assertEqual(self.manager.auto.status(p['id'])['state'],'conflict')


if __name__=='__main__':unittest.main()
