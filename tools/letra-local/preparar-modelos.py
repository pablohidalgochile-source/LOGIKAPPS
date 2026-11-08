from pathlib import Path
from huggingface_hub import snapshot_download
import urllib.request,hashlib
snapshot_download('mlx-community/whisper-small-mlx',local_dir=Path.home()/'.cache/whisper/small-mlx')
p=Path('.whisper-env/models/hub/checkpoints/955717e8-8726e21a.th');p.parent.mkdir(parents=True,exist_ok=True)
if not p.exists():
 tmp=p.with_suffix('.download');urllib.request.urlretrieve('https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/'+p.name,tmp)
 assert hashlib.sha256(tmp.read_bytes()).hexdigest().startswith('8726e21a'), 'Modelo no válido'
 tmp.replace(p)
print('Whisper y Demucs disponibles localmente.')
