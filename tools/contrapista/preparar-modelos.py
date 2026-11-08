from pathlib import Path
import hashlib,urllib.request
p=Path('.models/hub/checkpoints/955717e8-8726e21a.th');p.parent.mkdir(parents=True,exist_ok=True)
if not p.exists():
 t=p.with_suffix('.download');urllib.request.urlretrieve('https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/'+p.name,t)
 assert hashlib.sha256(t.read_bytes()).hexdigest().startswith('8726e21a')
 t.replace(p)
print('Modelo Demucs preparado; Basic Pitch se incluye en su paquete instalado.')
