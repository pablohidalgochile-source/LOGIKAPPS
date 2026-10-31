import hashlib, importlib.util, json, pathlib, subprocess, sys, tempfile, time, unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker',ROOT/'worker.py')
worker=importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)
MAGICK=worker.magick_path()

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='elephant-test-')
        self.directory=pathlib.Path(self.temp.name)
        self.source=self.directory/'source with spaces.png'
        subprocess.run([MAGICK,'-size','64x40','gradient:#2f4835-#c9ee68','-alpha','set','-channel','A','-evaluate','set','50%',str(self.source)],check=True)
        self.digest=hashlib.sha256(self.source.read_bytes()).hexdigest()
    def tearDown(self): self.temp.cleanup()
    def launch(self, mode='faithful', preset='2x', destination=None, extra=[]):
        destination=destination or self.directory/'result.png'
        p=subprocess.run([sys.executable,str(ROOT/'worker.py'),'--input',str(self.source),'--output',str(destination),'--mode',mode,'--preset',preset]+extra,capture_output=True,text=True)
        events=[json.loads(line) for line in p.stdout.splitlines()]
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.digest)
        return p,events,destination
    def dimensions(self,p):
        return subprocess.check_output([MAGICK,'identify','-format','%wx%h',str(p)],text=True)
    def test_faithful_alpha_and_spaces(self):
        p,events,out=self.launch()
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertEqual(self.dimensions(out),'128x80')
        alpha=float(subprocess.check_output([MAGICK,str(out),'-format','%[fx:mean.a]','info:'],text=True))
        self.assertAlmostEqual(alpha,.5,places=2)
        self.assertEqual(events[-1]['progress'],1)
    def test_4k_and_8k_aspect(self):
        for preset,size in [('4K','3840x2400'),('8K','7680x4800')]:
            p,_,out=self.launch(preset=preset,destination=self.directory/(preset+'.png'))
            self.assertEqual(p.returncode,0,p.stdout+p.stderr)
            self.assertEqual(self.dimensions(out),size)
    def test_half_pixel_rounding(self):
        self.assertEqual(worker.dimensions(100,50,"custom",333),(333,167))
    def test_custom(self):
        p,_,out=self.launch(preset='custom',extra=['--custom','333'])
        self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(self.dimensions(out),'333x208')
    def test_reject_existing_and_original(self):
        for out in [self.source,self.directory/'exists.png']:
            if out!=self.source: out.write_bytes(b'keep me')
            original=out.read_bytes()
            p,events,_=self.launch(destination=out)
            self.assertNotEqual(p.returncode,0)
            self.assertIn('error',events[-1]); self.assertEqual(out.read_bytes(),original)
    def test_invalid_size(self):
        for value in ['-1','10','999999']:
            p,events,out=self.launch(preset='custom',extra=['--custom',value])
            self.assertNotEqual(p.returncode,0); self.assertFalse(out.exists())
    def test_ai_preserves_alpha(self):
        if not worker.dependencies()['ai']: self.skipTest('Local AI unavailable')
        p,events,out=self.launch(mode='ai',preset='4x')
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertEqual(self.dimensions(out),'256x160')
        alpha=float(subprocess.check_output([MAGICK,str(out),'-format','%[fx:mean.a]','info:'],text=True))
        self.assertAlmostEqual(alpha,.5,places=2)
    def test_previously_rejected_large_plan(self):
        self.assertEqual(worker.ai_plan(6000,4000,7680,5120),[(6000,4000,7680,5120)])
        plan=worker.ai_plan(1500,1000,7680,5120)
        self.assertEqual(len(plan),2)
        self.assertTrue(all(w*h<=7680*5120 for _,_,w,h in plan))
        self.assertEqual(plan[-1][2:],(7680,5120))

    def test_tiled_real_ai_noninteger_scale(self):
        if not worker.dependencies()['ai']: self.skipTest('Local AI unavailable')
        rgb=self.directory/'rgb.png'
        subprocess.run([MAGICK,str(self.source),'-alpha','off',str(rgb)],check=True)
        out=self.directory/'tiled.png'
        reports=[]
        # Partial right and bottom edges, multiple rows, and non-integer scaling.
        worker.tiled_pass([MAGICK],worker.dependencies(),rgb,out,64,40,173,108,reports.append,core=25,overlap=32)
        self.assertEqual(self.dimensions(out),'173x108')
        self.assertEqual(reports[-1],100)
        self.assertEqual(list(self.directory.glob('tiles-*')),[])
        full=self.directory/'full.png'
        worker.enhance(worker.dependencies(),rgb,full,lambda p:None)
        reference=self.directory/'reference.png'
        subprocess.run([MAGICK,str(full),'-virtual-pixel','edge','-filter','Lanczos','-define','distort:viewport=173x108+0+0','-distort','AffineProjection',f'{173/256},0,0,{108/160},0,0','+repage',str(reference)],check=True)
        metric=subprocess.run([MAGICK,'compare','-metric','RMSE',str(reference),str(out),'null:'],capture_output=True,text=True)
        import re
        normalized=float(re.search(r'\(([^)]+)\)',metric.stderr).group(1))
        self.assertLess(normalized,0.025,metric.stderr)

    def test_cancel_ai(self):
        if not worker.dependencies()['ai']: self.skipTest('Local AI unavailable')
        out=self.directory/'cancel.png'
        cancel_source=self.directory/'cancel-source.png'
        subprocess.run([MAGICK,str(self.source),'-resize','1024x640!',str(cancel_source)],check=True)
        p=subprocess.Popen([sys.executable,str(ROOT/'worker.py'),'--input',str(cancel_source),'--output',str(out),'--mode','ai','--preset','4x'],stdout=subprocess.PIPE,text=True)
        while True:
            line=p.stdout.readline()
            self.assertTrue(line,'Worker ended before AI started')
            if 'pasada' in line: break
        time.sleep(.4); p.terminate(); remainder=p.communicate(timeout=20)[0]
        self.assertEqual(p.returncode,130,remainder); self.assertFalse(out.exists())

if __name__=='__main__': unittest.main(verbosity=2)
