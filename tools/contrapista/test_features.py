"""Behavioral checks for MIDI, project persistence and musical candidates."""
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from engine import SR,write_midi
from music import drum_notes,tonal_analysis
import projects


class FeatureTests(unittest.TestCase):
    def test_drum_midi_uses_channel_ten_and_has_named_track(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"drums.mid"
            write_midi(path,[{"pitch":36,"start":0,"end":.1,"velocity":100}],124,"Batería",9)
            data=path.read_bytes()
            self.assertEqual(data[:4],b"MThd")
            self.assertIn(bytes((0x99,36,100)),data)
            self.assertIn(bytes((0x89,36,0)),data)
            self.assertIn("Batería".encode(),data)
            self.assertEqual(struct.unpack(">I",data[18:22])[0],len(data)-22)

    def test_project_name_and_favorite_survive_reload(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(projects,"ROOT",Path(tmp)):
            identifier="a"*32
            folder=projects.directory(identifier)
            folder.mkdir()
            report={"input_name":"Mi pista.wav","duration_s":300,"bpm":124,"audio_files":{},"notes":[]}
            (folder/"Informe.json").write_text(json.dumps(report))
            (folder/"Contrapista.zip").write_bytes(b"test")
            projects.metadata(identifier,report)
            projects.edit(identifier,{"name":"Versión nueva","favorite":True})
            saved=projects.library()[0]
            self.assertEqual(saved["name"],"Versión nueva")
            self.assertTrue(saved["favorite"])
            self.assertEqual(saved["duration_s"],300)
            with self.assertRaises(ValueError):projects.directory("../escape")
            with self.assertRaises(ValueError):projects.edit(identifier,{"name":""})

    def test_no_chords_or_drum_events_in_silence(self):
        audio=np.zeros((SR*2,2),np.float32)
        self.assertEqual(drum_notes(audio),[])
        self.assertIsNone(tonal_analysis(audio,120)["key"])


if __name__=="__main__":
    unittest.main()
