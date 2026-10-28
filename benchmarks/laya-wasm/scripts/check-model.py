#!/usr/bin/env python3
"""Check exported Laya browser ONNX artifacts and write a verifiable manifest.

Usage:
  python3 scripts/check-model.py public/models/laya
Does not download weights or claim inference succeeded.
"""
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "public/models/laya")
required = ("encoder.onnx", "head.onnx", "tokenizer.json", "rl_agent_config.json")
if not root.is_dir():
    sys.exit(f"Model directory absent: {root}. Export ONNX weights before device testing.")
missing = [name for name in required if not (root / name).is_file()]
if missing:
    sys.exit(f"Missing model files: {', '.join(missing)}")
paths = sorted(p for p in root.iterdir() if p.is_file() and p.name != "manifest.json")
files = []
for p in paths:
    digest = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    files.append({"name": p.name, "bytes": p.stat().st_size, "sha256": digest.hexdigest()})
for name in ("tokenizer.json", "rl_agent_config.json"):
    with (root / name).open(encoding="utf-8") as f:
        json.load(f)
report = {
    "schemaVersion": "instinct-laya-model-manifest-v1",
    "totalBytes": sum(f["bytes"] for f in files),
    "files": files,
    "verifiedInference": False,
}
(root / "manifest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"Validated {len(files)} artifacts ({report['totalBytes']} bytes). Manifest: {root / 'manifest.json'}")
