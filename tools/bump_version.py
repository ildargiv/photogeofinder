#!/usr/bin/env python3
"""Set a new app version everywhere: python3 tools/bump_version.py 2.1.0"""
import re, sys, pathlib
if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit("usage: bump_version.py X.Y.Z")
v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
cfg = root / "config.js"
cfg.write_text(re.sub(r"APP_VERSION = '[^']*'", f"APP_VERSION = '{v}'", cfg.read_text(encoding="utf-8")), encoding="utf-8")
sw = root / "sw.js"
sw.write_text(re.sub(r"const VERSION = '[^']*'", f"const VERSION = 'pgf-{v}'", sw.read_text(encoding="utf-8")), encoding="utf-8")
print(f"Version set to {v}. Commit, then: git tag v{v} && git push origin main v{v}")
