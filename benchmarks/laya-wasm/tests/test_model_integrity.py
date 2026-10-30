import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

CHECK = pathlib.Path(__file__).resolve().parents[1] / 'scripts/check-model.py'
class ModelIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        for name, content in {'encoder.onnx': b'encoder', 'head.onnx': b'head', 'tokenizer.json': b'{}', 'rl_agent_config.json': b'{}'}.items():
            (self.root / name).write_bytes(content)
    def check(self, *args):
        return subprocess.run([sys.executable, str(CHECK), str(self.root), *args], capture_output=True, text=True)
    def test_missing_file_rejected(self):
        (self.root / 'head.onnx').unlink()
        self.assertNotEqual(self.check().returncode, 0)
    def test_empty_onnx_rejected(self):
        (self.root / 'encoder.onnx').write_bytes(b'')
        result = self.check()
        self.assertNotEqual(result.returncode, 0, result.stdout)
    def test_nonobject_json_rejected(self):
        (self.root / 'tokenizer.json').write_text('null')
        self.assertNotEqual(self.check().returncode, 0)
    def test_existing_manifest_is_compared_without_rewriting(self):
        self.assertEqual(self.check().returncode, 0)
        manifest = (self.root / 'manifest.json').read_bytes()
        self.assertEqual(self.check('--verify').returncode, 0)
        (self.root / 'encoder.onnx').write_bytes(b'encodEr')
        result = self.check('--verify')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('mismatch', result.stderr.lower())
        self.assertEqual((self.root / 'manifest.json').read_bytes(), manifest)
    def test_manifest_sha_and_unmeasured_inference(self):
        self.assertEqual(self.check().returncode, 0)
        manifest = json.loads((self.root / 'manifest.json').read_text())
        self.assertFalse(manifest['verifiedInference'])
        head = next(x for x in manifest['files'] if x['name'] == 'head.onnx')
        self.assertEqual(head['bytes'], 4)
        self.assertEqual(head['sha256'], '9f2e6d33a3717ee826353a404ba4618d1aeeb6879ad7936bce8ed5f46814924d')
if __name__ == '__main__':
    unittest.main()
