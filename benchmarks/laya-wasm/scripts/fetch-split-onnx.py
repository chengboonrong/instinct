#!/usr/bin/env python3
"""Fetch a published split-ONNX Laya checkpoint for the Safari WASM experiment.

The third-party model is NOT bundled, trusted without checks, or committed to Git.
Its publisher's listed SHA-256 digests are used to verify every required file.
This script requires huggingface_hub (pip install huggingface_hub).

Usage:
  python3 scripts/fetch-split-onnx.py --dry-run
  python3 scripts/fetch-split-onnx.py
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import sys

REPOSITORY = "pleveneur/laya-multilingual-onnx"
# Publisher's public model card, 2026-10-28:
# https://huggingface.co/pleveneur/laya-multilingual-onnx
EXPECTED = {
    "encoder.onnx": (1230200269, "b1d273e10d241381470745c39ab2e6ee5c41b4fbb97a78f67fc71a572def41ea"),
    "head.onnx": (60129263, "fd7d7d8a3b1e62c88e2ac885f719b92e01a22cf7e1d1c281800ad6166e2d081a"),
    "tokenizer.json": (34363188, "609d8f4c067cd3950f88594c5a802616cea245823836ef5848ee4fc40aab5b6f"),
    "rl_agent_config.json": (472, "25061739243b617ad88d1219ba6f8a9c86c5881ca28df024fa2d9b3b2fcc30c6"),
}

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Show source/size without network or file writes")
    parser.add_argument("--output-dir", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "public" / "models" / "laya")
    args = parser.parse_args()
    total = sum(size for size, _ in EXPECTED.values())
    print(f"Source: https://huggingface.co/{REPOSITORY}")
    print(f"Expected bytes: {total} ({total / 2**30:.2f} GiB)")
    print("Verify SHA256 of each downloaded file; do not use if verification fails.")
    if args.dry_run:
        for filename, (size, sha) in EXPECTED.items():
            print(f"  {filename}: {size} bytes, SHA256 {sha}")
        return

    # The download may need considerably more free disk space than the payload itself.
    free = shutil.disk_usage(args.output_dir.parent if args.output_dir.parent.exists() else pathlib.Path.cwd()).free
    if free < total * 2:
        sys.exit(f"Insufficient free disk for safe download: {free} bytes; aim for >= {total * 2}")

    try:
        from huggingface_hub import HfApi, hf_hub_download
    except ImportError:
        sys.exit("Install huggingface_hub: python3 -m pip install huggingface_hub")

    api = HfApi()
    revision = api.model_info(REPOSITORY).sha
    if not revision or len(revision) != 40:
        sys.exit("Could not resolve an immutable model revision")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, (size, sha) in EXPECTED.items():
        target = args.output_dir / name
        if not (target.is_file() and target.stat().st_size == size and digest(target) == sha):
            source = pathlib.Path(hf_hub_download(REPOSITORY, filename=name, revision=revision))
            if source.stat().st_size != size or digest(source) != sha:
                sys.exit(f"Upstream checksum mismatch: {name}. Refusing unverified model.")
            shutil.copyfile(source, target)
        if target.stat().st_size != size or digest(target) != sha:
            sys.exit(f"Local file integrity check failed: {name}")
        print("SHA256 verified:", name, flush=True)

    source_info = {
        "source": f"https://huggingface.co/{REPOSITORY}",
        "revision": revision,
        "sourceCheckpoint": "convaiinnovations/laya, multilingual subfolder",
        "provider": "third-party split-ONNX conversion",
        "verifiedAgainstPublisherHashes": True,
        "verifiedInference": False,
        "modelVariant": "multilingual",
        "license": "Apache-2.0",
    }
    (args.output_dir / "source.json").write_text(json.dumps(source_info, indent=2) + "\n", encoding="utf-8")
    import subprocess
    subprocess.run(
        [sys.executable, str(pathlib.Path(__file__).with_name("check-model.py")), str(args.output_dir)],
        check=True,
    )
    print("Model assets prepared; inference correctness and iPhone compatibility NOT verified.", flush=True)

if __name__ == "__main__":
    main()
