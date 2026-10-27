@echo off
setlocal
cd /d "%~dp0"
set "PATH=D:\;C:\Program Files\Git\cmd;%PATH%"
if not exist data mkdir data
"D:\node.exe" publish-close.mjs >> "%~dp0data\refresh.log" 2>&1
