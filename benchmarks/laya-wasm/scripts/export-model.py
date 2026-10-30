#!/usr/bin/env python3
"""Download a pinned Laya checkpoint and export its split browser ONNX files.

Prerequisites:
  npm run bootstrap
  python3 -m venv .venv
  .venv/bin/python -m pip install -e vendor/laya 'onnxscript' 'onnxruntime' 'huggingface_hub'

Then:
  .venv/bin/python scripts/export-model.py

This may download GBs of model weights and require substantially more RAM than
an ordinary mobile build. It does not perform an iPhone benchmark.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

try:
    from huggingface_hub import snapshot_download
except ImportError as exc:
    sys.exit("Install huggingface_hub in the Python environment first: " + str(exc))

root = Path(__file__).resolve().parents[1]
repo_dir = root / "vendor" / "laya"
export_script = repo_dir / "laya-ts" / "scripts" / "export_onnx.py"
out_dir = root / "public" / "models" / "laya"
if not export_script.is_file():
    sys.exit("Upstream exporter not found. Run npm run bootstrap first.")

# Reviewed upstream checkpoint revision listed in laya-ts/src/providers.ts.
checkpoint_revision = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"
source_repo = "convaiinnovations/laya"
print("Downloading pinned English checkpoint", checkpoint_revision, flush=True)
snapshot = snapshot_download(
    repo_id=source_repo,
    revision=checkpoint_revision,
    allow_patterns=[
        "rl_agent_config.json", "model.safetensors", "config.json",
        "tokenizer.json", "tokenizer/*", "encoder/*"
    ],
    token=os.getenv("HF_TOKEN"),
)
# Keep the upstream's real Torch-vs-ONNX numerical validation enabled.
subprocess.run(
    [sys.executable, str(export_script), "--model-dir", str(snapshot),
     "--out-dir", str(out_dir), "--seq-len", "16", "--verify-len", "512"],
    check=True, cwd=repo_dir
)
(out_dir / "source.json").write_text(json.dumps({
    "source": source_repo,
    "revision": checkpoint_revision,
    "exporter": "laya-ts/scripts/export_onnx.py",
    "verification": "Torch-vs-ONNX upstream exporter (seq 16 / 512)",
}, indent=2)+"\n", encoding="utf-8")
subprocess.run(
    [sys.executable, str(root / "scripts" / "check-model.py"), str(out_dir)],
    check=True, cwd=root
)
print("Export complete:", out_dir, flush=True)
