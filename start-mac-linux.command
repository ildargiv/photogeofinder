#!/bin/bash
cd "$(dirname "$0")"
echo "PhotoGeoFinder: http://localhost:8765  (окно не закрывайте)"
(sleep 1; (open http://localhost:8765/index.html || xdg-open http://localhost:8765/index.html) >/dev/null 2>&1) &
python3 -m http.server 8765
