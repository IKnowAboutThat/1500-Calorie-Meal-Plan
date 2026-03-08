import subprocess
import sys

if len(sys.argv) < 2:
    print("Usage: python push.py \"commit message\"")
    sys.exit(1)

message = sys.argv[1]

commands = [
    ["git", "add", "."],
    ["git", "commit", "-m", message],
    ["git", "push"],
]

for cmd in commands:
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)
