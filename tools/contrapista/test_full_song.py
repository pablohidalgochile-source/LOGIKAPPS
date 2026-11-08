"""Regression checks for complete songs and block boundary continuity.

Run from this folder with: python3 -m unittest test_full_song
"""
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from engine import SR, read_audio, separation, separation_block, wav


class FullSongTests(unittest.TestCase):
    def test_decoder_keeps_audio_after_five_minutes(self):
        with tempfile.TemporaryDirectory() as scratch:
            path=Path(scratch)/"complete.wav"
            # Audible information deliberately appears only beyond five minutes.
            with wave.open(str(path),"wb") as f:
                f.setparams((2,2,SR,0,"NONE","not compressed"))
                silence=np.zeros((SR,2),dtype="<i2").tobytes()
                for _ in range(301):
                    f.writeframes(silence)
                t=np.arange(SR)/SR
                tone=np.rint(np.sin(2*np.pi*55*t)*9000).astype("<i2")
                f.writeframes(np.repeat(tone[:,None],2,axis=1).tobytes())
            audio=read_audio(path)
            self.assertEqual(len(audio),302*SR)
            self.assertGreater(float(np.max(np.abs(audio[-SR:]))),.2)

    def test_separation_preserves_audio_at_block_boundaries(self):
        t=np.arange(11*SR,dtype=np.float32)/SR
        signal=.15*np.sin(2*np.pi*55*t)+.025*np.sin(2*np.pi*2340*t)
        stereo=np.repeat(signal[:,None],2,axis=1)
        reference=separation_block(stereo)
        blocks=separation(stereo)
        np.testing.assert_allclose(sum(blocks.values()),stereo,atol=2e-7)
        for key in blocks:
            np.testing.assert_allclose(blocks[key],reference[key],atol=1e-6)
        with tempfile.TemporaryDirectory() as scratch:
            path=Path(scratch)/"complete-output.wav"
            wav(path,stereo,.5)
            with wave.open(str(path)) as f:
                self.assertEqual(f.getnframes(),len(stereo))


if __name__=="__main__":
    unittest.main()
