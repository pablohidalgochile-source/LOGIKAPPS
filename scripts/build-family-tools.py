#!/usr/bin/env python3
"""Build the reviewed native tools without copying any user's application data."""
from pathlib import Path
import subprocess, os, plistlib, zipfile, stat, hashlib, json
R=Path(__file__).resolve().parent.parent
def run(args,cwd):subprocess.run(args,cwd=cwd,check=True)
for slug,name,exe,check in [('limpieza-familiar','Limpieza Familiar','LimpiezaFamiliar','ArchiveCoreChecks'),('control-suscripciones','Control de Suscripciones','ControlSuscripciones','SubscriptionChecks'),('letra-local','Letra Local','LetraLocal',None)]:
 d=R/'tools'/slug;build=d/'.build';build.mkdir(exist_ok=True)
 os.environ['CLANG_MODULE_CACHE_PATH']=str(build/'module-cache')
 os.environ['SWIFTPM_MODULECACHE_OVERRIDE']=str(build/'module-cache')
 app=build/f'{name}.app';contents=app/'Contents';(contents/'MacOS').mkdir(parents=True,exist_ok=True)
 if check:
  flags=['-c','release','-j','4','--disable-sandbox','--cache-path',str(build/'cache'),'--scratch-path',str(build/'swift'),'-Xswiftc','-file-prefix-map','-Xswiftc',str(d)+'=.', '-Xswiftc','-debug-prefix-map','-Xswiftc',str(d)+'=.']
  run(['swift','build',*flags],d)
  binary=Path(subprocess.check_output(['swift','build',*flags,'--show-bin-path'],cwd=d,text=True).strip())
  run([str(binary/check)],d)
  (contents/'MacOS'/exe).write_bytes((binary/exe).read_bytes())
 else:
  run(['swiftc','-module-cache-path',str(build/'cache'),'-parse-as-library','-O','-file-prefix-map',str(d)+'=.','-debug-prefix-map',str(d)+'=.','main.swift','-o',str(contents/'MacOS'/exe)],d)
 (contents/'MacOS'/exe).chmod(0o755)
 run(['strip','-S',str(contents/'MacOS'/exe)],d)
 info=plistlib.loads((d/'Info.plist').read_bytes());info.setdefault('LSMinimumSystemVersion','13.0')
 (contents/'Info.plist').write_bytes(plistlib.dumps(info))
 if info.get('CFBundleIconFile'):
  (contents/'Resources').mkdir(exist_ok=True);icon=info['CFBundleIconFile']+'.icns';(contents/'Resources'/icon).write_bytes((d/icon).read_bytes())
 run(['codesign','--force','--sign','-','--timestamp=none',str(app)],d)
 run(['codesign','--verify','--deep','--strict',str(app)],d)
 target=d/f'{name}.zip';members={}
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(app.rglob('*')):
   if not p.is_file():continue
   rel=str(p.relative_to(app.parent));data=p.read_bytes()
   assert b'/Users/' not in data and b'/home/' not in data,rel
   e=zipfile.ZipInfo(rel,(1980,1,1,0,0,0));e.create_system=3;e.external_attr=(stat.S_IFREG|(0o755 if '/MacOS/' in rel else 0o644))<<16
   z.writestr(e,data,compress_type=zipfile.ZIP_DEFLATED);members[rel]=hashlib.sha256(data).hexdigest()
 review={'file':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'members':members,'architecture':'arm64','signature':'ad-hoc','data':'No personal data; compiled from distribution sources.'}
 (d/'binary-review.json').write_text(json.dumps(review,indent=2)+'\n')
 allow=json.loads((d/'public-files.json').read_text())
 for n in [target.name,'binary-review.json']:
  if n not in allow:allow.append(n)
 (d/'public-files.json').write_text(json.dumps(sorted(allow),ensure_ascii=False,indent=2)+'\n')
 print(name,'built and reviewed',flush=True)
