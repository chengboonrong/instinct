#!/usr/bin/env python3
"""Create an artifact digest manifest, or compare current files with --verify.

This checks byte integrity and JSON structure, not ONNX numerical correctness.
"""
import argparse
import hashlib
import json
import pathlib
import sys

REQUIRED = ('encoder.onnx', 'head.onnx', 'tokenizer.json', 'rl_agent_config.json')

def describe(root):
    if not root.is_dir():
        raise ValueError(f'Model directory absent: {root}')
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    if missing:
        raise ValueError(f'Missing model files: {", ".join(missing)}')
    names = list(REQUIRED) + [name for name in ('source.json', 'encoder.onnx.data', 'head.onnx.data') if (root / name).is_file()]
    files = []
    for name in sorted(names):
        path = root / name
        size = path.stat().st_size
        if size <= 0:
            raise ValueError(f'Empty model artifact: {name}')
        digest = hashlib.sha256()
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b''):
                digest.update(chunk)
        if name.endswith('.json'):
            value = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(value, dict):
                raise ValueError(f'Expected JSON object: {name}')
        files.append({'name': name, 'bytes': size, 'sha256': digest.hexdigest()})
    return {'schemaVersion': 'instinct-laya-model-manifest-v1', 'totalBytes': sum(entry['bytes'] for entry in files), 'files': files, 'verifiedInference': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=pathlib.Path, nargs='?', default=pathlib.Path('public/models/laya'))
    parser.add_argument('--verify', action='store_true', help='Compare existing manifest; never replace it')
    args = parser.parse_args()
    try:
        report = describe(args.directory)
        target = args.directory / 'manifest.json'
        if args.verify:
            expected = json.loads(target.read_text(encoding='utf-8'))
            if expected != report:
                raise ValueError('Artifact manifest mismatch; refusing changed model files')
        else:
            temporary = target.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            temporary.replace(target)
        print(f"{'Verified' if args.verify else 'Inventoried'} {len(report['files'])} artifacts ({report['totalBytes']} bytes). Manifest: {target}")
    except (OSError, ValueError) as error:
        sys.exit(str(error))

if __name__ == '__main__':
    main()
