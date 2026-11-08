import shutil
import subprocess
import sys
from pathlib import Path

import mlx_whisper
import numpy as np

audio, model, language, *options = sys.argv[1:]
if not Path(model, "weights.safetensors").is_file():
    sys.exit("Falta el modelo local Whisper.")

def decode_audio(channels, sample_rate):
    pcm = subprocess.check_output([
        shutil.which("ffmpeg") or "ffmpeg", "-nostdin", "-loglevel", "error",
        "-protocol_whitelist", "file", "-i", audio, "-vn",
        "-f", "s16le", "-ac", str(channels), "-ar", str(sample_rate), "pipe:1",
    ])
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768

if options:
    import torch
    from fractions import Fraction
    from demucs.apply import apply_model
    from demucs.htdemucs import HTDemucs
    from demucs.pretrained import get_model
    from scipy.signal import resample_poly

    weights = Path(options[0])
    if not weights.is_dir() or not weights.joinpath("955717e8-8726e21a.th").is_file():
        sys.exit("Faltan los pesos locales de Demucs.")
    with torch.serialization.safe_globals([HTDemucs, Fraction, np.dtype, type(np.dtype("float64")), (np._core.multiarray.scalar, "numpy.core.multiarray.scalar")]):
        separator = get_model("955717e8", repo=weights)
    separator.eval()
    audio_tensor = torch.from_numpy(decode_audio(2, separator.samplerate).reshape(-1, 2).T.copy())
    mono = audio_tensor.mean(dim=0)
    center, scale = mono.mean(), mono.std(unbiased=False).clamp_min(1e-6)
    with torch.inference_mode():
        stems = apply_model(separator, ((audio_tensor - center) / scale)[None], device="cpu", shifts=0)
    vocals = (stems[0, separator.sources.index("vocals")].mean(dim=0) * scale + center).numpy()
    samples = resample_poly(vocals, 160, 441).astype(np.float32)
else:
    samples = decode_audio(1, 16000)

result = mlx_whisper.transcribe(
    samples, path_or_hf_repo=model, language=language,
    task="transcribe", condition_on_previous_text=False,
)
for segment in result["segments"]:
    text = segment["text"].strip()
    if text:
        seconds = int(segment["start"])
        print(f"[{seconds // 60:02d}:{seconds % 60:02d}] {text}")
