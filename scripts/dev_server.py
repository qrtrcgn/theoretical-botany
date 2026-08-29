import os
import sys
import time
import subprocess

def get_mtimes():
    mtimes = {}
    for root, _, files in os.walk('.'):
        for f in files:
            if f.endswith('.py') or f.endswith('.html'):
                path = os.path.join(root, f)
                try:
                    mtimes[path] = os.stat(path).st_mtime
                except OSError:
                    pass
    return mtimes

def main():
    print("Starting Dev Server with Hot Reloading...")
    
    # We want to run the interactive_server.py
    cmd = [".venv/bin/python3", "interactive_server.py"]
    process = subprocess.Popen(cmd)
    
    last_mtimes = get_mtimes()
    
    try:
        while True:
            time.sleep(1.0)
            current_mtimes = get_mtimes()
            
            changed = False
            for path, mtime in current_mtimes.items():
                if path != './dev_server.py' and (path not in last_mtimes or mtime > last_mtimes[path]):
                    changed = True
                    print(f"\n[DEV] Detected change in {path}. Restarting server...")
                    break
                    
            if changed:
                process.terminate()
                process.wait()
                process = subprocess.Popen(cmd)
                last_mtimes = current_mtimes
                
    except KeyboardInterrupt:
        print("\nStopping Dev Server...")
        process.terminate()

if __name__ == '__main__':
    main()
