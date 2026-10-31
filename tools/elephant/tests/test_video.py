import hashlib,json,pathlib,subprocess,sys,tempfile,unittest,os,time
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import video_worker as video
ROOT=pathlib.Path(__file__).resolve().parents[1]
FF=video.tool('ffmpeg')

def ff(*args):
    p=subprocess.run([FF,'-hide_banner','-loglevel','error','-y',*map(str,args)],capture_output=True,text=True)
    if p.returncode: raise RuntimeError(p.stderr)

def frame_count(path):
    return int(subprocess.check_output([video.tool('ffprobe'),'-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','default=nw=1:nk=1',str(path)],text=True))

class VideoTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='elephant-video-test-');self.dir=pathlib.Path(self.temp.name)
        self.src=self.dir/'source space.mp4'
        ff('-f','lavfi','-i','testsrc2=s=48x32:r=8:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',self.src)
        self.original=video.digest(self.src)
    def tearDown(self):self.temp.cleanup()
    def args(self,mode='faithful',format='mp4',extra=[]):
        return [sys.executable,str(ROOT/'video_worker.py'),'--input',str(self.src),'--output',str(self.dir/('output.mov' if format=='prores' else 'output.mp4')),'--work',str(self.dir/'job'),'--mode',mode,'--format',format,'--preset','2x',*extra]
    def run_job(self,mode='faithful',format='mp4',extra=[]):
        p=subprocess.run(self.args(mode,format,extra),capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertEqual(video.digest(self.src),self.original)
        return self.dir/('output.mov' if format=='prores' else 'output.mp4'),p
    def assert_media(self,out,count=8,duration=1):
        i=video.probe(out)
        self.assertEqual((i['width'],i['height']),(96,64));self.assertEqual(i['audio_tracks'],1)
        self.assertAlmostEqual(i['duration'],duration,delta=.05);self.assertEqual(frame_count(out),count)
    def test_faithful_mp4_audio_frames(self):
        out,_=self.run_job();self.assert_media(out)
    def test_prores(self):
        out,_=self.run_job(format='prores');self.assert_media(out)
        self.assertEqual(video.probe(out)['codec'],'prores')
    def test_preview_time_window(self):
        out,_=self.run_job(extra=['--start','.25','--duration','.5']);self.assert_media(out,4,.5)
    def test_no_audio(self):
        ff('-i',self.src,'-an','-c:v','copy',self.dir/'silent.mp4')
        self.src=self.dir/'silent.mp4';self.original=video.digest(self.src)
        out,_=self.run_job();self.assertEqual(video.probe(out)['audio_tracks'],0)
    def test_existing_output(self):
        path=self.dir/'output.mp4';path.write_bytes(b'keep')
        p=subprocess.run(self.args(),capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertEqual(path.read_bytes(),b'keep')
    def test_changed_source_checkpoint(self):
        self.run_job();(self.dir/'output.mp4').unlink()
        os.utime(self.src,None)
        p=subprocess.run(self.args(),capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertIn('cambiaron',p.stdout)
    def test_variable_cadence_faithful_and_ai_rejection(self):
        vfr=self.dir/'vfr.mp4'
        ff('-f','lavfi','-i','testsrc2=s=48x32:r=10:d=1','-vf',"select='eq(n,0)+eq(n,1)+eq(n,4)+eq(n,9)'",'-fps_mode','vfr','-c:v','libx264','-bf','0',vfr)
        self.src=vfr;self.original=video.digest(vfr)
        out,_=self.run_job();self.assertEqual(frame_count(out),4)
        def stamps(path):
            raw=subprocess.check_output([video.tool('ffprobe'),'-v','error','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)])
            return [float(f['best_effort_timestamp_time']) for f in json.loads(raw)['frames']]
        for a,b in zip(stamps(vfr),stamps(out)): self.assertAlmostEqual(a,b,places=3)
        self.assertAlmostEqual(video.probe(out)['duration'],video.probe(vfr)['duration'],delta=.05)
        (self.dir/'output.mp4').unlink()
        p=subprocess.run(self.args(mode='ai',extra=['--work',str(self.dir/'vfr-ai')]),capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertIn('cadencia variable',p.stdout)
    def test_ai_chunks_and_resume(self):
        args=self.args(mode='ai',extra=['--chunk-frames','3'])
        p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        lines=[]
        while True:
            line=p.stdout.readline();lines.append(line)
            if not line:self.fail('Worker ended: '+''.join(lines)+p.stderr.read())
            if 'Bloque guardado' in line:
                p.terminate();break
        rest,err=p.communicate(timeout=30)
        self.assertEqual(p.returncode,130,''.join(lines)+rest+err)
        checkpoint=self.dir/'job/chunk-000000.mp4';old_hash=video.digest(checkpoint);old_time=checkpoint.stat().st_mtime_ns
        resumed=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        prefix=[]
        while True:
            line=resumed.stdout.readline();prefix.append(line)
            self.assertTrue(line,'Resume ended early')
            if 'Reanudando desde' in line: break
        self.assertEqual(video.digest(checkpoint),old_hash);self.assertEqual(checkpoint.stat().st_mtime_ns,old_time)
        rest,err=resumed.communicate(timeout=60)
        self.assertEqual(resumed.returncode,0,''.join(prefix)+rest+err)
        self.assertFalse(checkpoint.exists(),'Successful jobs should release recovery payloads')
        self.assert_media(self.dir/'output.mp4')
        self.assertEqual(video.digest(self.src),self.original)
    def test_pixel_aspect_and_portrait(self):
        anam=self.dir/'anam.mp4'
        ff('-i',self.src,'-vf','setsar=2','-c:v','libx264','-c:a','copy',anam)
        self.assertEqual(video.probe(anam)['width'],96)
        self.src=anam;self.original=video.digest(anam)
        out,_=self.run_job();self.assertEqual(video.probe(out)['width'],192)
    def test_audio_delay_and_multiple_tracks(self):
        src=self.dir/'delay.mp4'
        ff('-f','lavfi','-i','testsrc2=s=48x32:r=8:d=1','-f','lavfi','-i','sine=frequency=660:duration=0.75','-f','lavfi','-i','sine=frequency=880:duration=1','-filter_complex','[1:a]adelay=250:all=1[a]','-map','0:v','-map','[a]','-map','2:a','-c:v','libx264','-c:a','aac',src)
        self.src=src;self.original=video.digest(src)
        out,_=self.run_job();self.assertEqual(video.probe(out)['audio_tracks'],2)
        import array
        def onset(path):
            data=subprocess.check_output([FF,'-v','error','-i',str(path),'-map','0:a:0','-f','f32le','-ac','1','-ar','8000','pipe:1'])
            samples=array.array('f');samples.frombytes(data)
            return next(i/8000 for i,x in enumerate(samples) if abs(x)>.02)
        self.assertAlmostEqual(onset(src),onset(out),delta=.02)
    def test_real_4k_and_8k_exports(self):
        src=self.dir/'one.mp4'
        ff('-f','lavfi','-i','color=blue:s=48x32:r=1:d=1','-c:v','libx264',src)
        self.src=src;self.original=video.digest(src)
        for preset,w,h in [('4K',3840,2560),('8K',7680,5120)]:
            out,_=self.run_job(extra=['--preset',preset,'--work',str(self.dir/preset)])
            info=video.probe(out);self.assertEqual((info['width'],info['height']),(w,h));self.assertEqual(frame_count(out),1)
            out.unlink()
    def test_ai_fractional_rate(self):
        src=self.dir/'fractional.mp4'
        ff('-f','lavfi','-i','testsrc2=s=48x32:r=30000/1001','-frames:v','5','-c:v','libx264',src)
        self.src=src;self.original=video.digest(src)
        out,_=self.run_job(mode='ai',extra=['--chunk-frames','2'])
        self.assertEqual(frame_count(out),5)
        self.assertAlmostEqual(video.probe(out)['duration'],5*1001/30000,delta=.002)
    def test_hdr_rejected(self):
        src=self.dir/'hdr.mp4'
        ff('-i',self.src,'-vf','setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc','-c:v','libx264','-c:a','copy',src)
        self.src=src
        p=subprocess.run(self.args(),capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0);self.assertIn('HDR',p.stdout)

    def test_rotation_preserved_visually(self):
        rotated=self.dir/'rotated.mp4'
        ff('-display_rotation','90','-i',self.src,'-c','copy',rotated)
        self.src=rotated;self.original=video.digest(rotated)
        self.assertEqual((video.probe(rotated)['width'],video.probe(rotated)['height']),(32,48))
        out,_=self.run_job();info=video.probe(out)
        self.assertEqual((info['width'],info['height']),(64,96));self.assertEqual(info['rotation'],0)
    def test_ai_prores_preview(self):
        out,_=self.run_job(mode='ai',format='prores',extra=['--start','.25','--duration','.25','--chunk-frames','1'])
        self.assert_media(out,2,.25);self.assertEqual(video.probe(out)['codec'],'prores')

    def test_target_sizes(self):
        info=dict(width=1920,height=1080)
        self.assertEqual(video.target(info,'4K',0)[:2],(3840,2160))
        self.assertEqual(video.target(info,'8K',0)[:2],(7680,4320))
        info=dict(width=101,height=51)
        self.assertEqual(video.target(info,'custom',303),(304,154,303,153))

if __name__=='__main__':unittest.main(verbosity=2)
