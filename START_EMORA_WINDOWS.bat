@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ kerak. https://nodejs.org saytidan o'rnating.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
echo EMORA ishga tushmoqda...
echo Brauzerda oching: http://localhost:8787
node server.mjs
pause
