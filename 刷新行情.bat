@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 没有找到 Node.js，无法更新行情。
  pause
  exit /b 1
)
node update.mjs
if errorlevel 1 (
  echo 行情更新失败。
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173/"
node server.mjs
pause
