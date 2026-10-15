@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo PhotoGeoFinder запускается на http://localhost:8765
echo Откроется браузер. В адресной строке нажмите значок установки, чтобы поставить программу.
echo Это окно не закрывайте, пока работаете.
start "" http://localhost:8765/index.html
where py >nul 2>nul && (py -m http.server 8765) || (python -m http.server 8765)
