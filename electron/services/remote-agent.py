"""Private stdio filesystem agent for explicitly connected SSH/WSL/container workspaces."""
import json
import os
import sys

ROOT = os.path.realpath(sys.argv[1])
if not os.path.isdir(ROOT):
    raise ValueError('Remote workspace folder does not exist or is not a directory')
IGNORED = {'.git', 'node_modules', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next'}

def resolve(relative):
    if not isinstance(relative, str) or not relative or relative.startswith('/') or '\x00' in relative or '\\' in relative:
        raise ValueError('Invalid relative path')
    parts = relative.split('/')
    if any(part in ('', '.', '..', '.git') for part in parts):
        raise ValueError('Invalid path component')
    current = ROOT
    for part in parts:
        current = os.path.join(current, part)
        if os.path.islink(current):
            raise ValueError('Symlink access is not supported')
    if os.path.commonpath([ROOT, os.path.realpath(current)]) != ROOT:
        raise ValueError('Path escapes the workspace')
    return current

def execute(method, params):
    if method == 'scan':
        files, skipped, total = [], 0, 0
        for parent, dirs, names in os.walk(ROOT, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in IGNORED and not os.path.islink(os.path.join(parent, d)))
            for name in sorted(names):
                full = os.path.join(parent, name)
                if os.path.islink(full):
                    skipped += 1
                    continue
                size = os.path.getsize(full)
                if len(files) >= 3000 or size > 2 * 1024 * 1024 or total + size > 20 * 1024 * 1024:
                    skipped += 1
                    continue
                try:
                    with open(full, 'r', encoding='utf-8', newline='') as stream:
                        content = stream.read()
                    if '\x00' in content:
                        raise ValueError('Binary file')
                except (UnicodeError, ValueError):
                    skipped += 1
                    continue
                files.append({'path': os.path.relpath(full, ROOT).replace(os.sep, '/'), 'content': content})
                total += size
        return {'files': files, 'skipped': skipped}
    full = resolve(params['path'])
    if method == 'read':
        with open(full, 'r', encoding='utf-8', newline='') as stream:
            return stream.read()
    if method == 'write':
        expected = params['expected']
        exists = os.path.exists(full)
        if exists:
            with open(full, 'r', encoding='utf-8', newline='') as stream:
                original = stream.read()
            if expected == '\x00' or original != expected:
                raise ValueError('File changed remotely; export a copy before refreshing')
        elif expected != '\x00':
            raise ValueError('File was removed remotely')
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w', encoding='utf-8', newline='') as stream:
            stream.write(params['content'])
        return True
    if method == 'rename':
        destination = resolve(params['to'])
        if os.path.exists(destination):
            raise ValueError('Destination already exists')
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        os.rename(full, destination)
        return True
    if method == 'delete':
        os.unlink(full)
        return True
    raise ValueError('Unknown operation')

while True:
    header = sys.stdin.buffer.readline()
    if not header:
        break
    if not header.lower().startswith(b'content-length:'):
        continue
    length = int(header.split(b':', 1)[1])
    if length > 16 * 1024 * 1024:
        break
    while sys.stdin.buffer.readline().strip():
        pass
    request = json.loads(sys.stdin.buffer.read(length))
    try:
        response = {'jsonrpc': '2.0', 'id': request['id'], 'result': execute(request['method'], request.get('params', {}))}
    except Exception as error:
        response = {'jsonrpc': '2.0', 'id': request['id'], 'error': {'message': str(error)}}
    payload = json.dumps(response, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(('Content-Length: %d\r\n\r\n' % len(payload)).encode() + payload)
    sys.stdout.buffer.flush()
