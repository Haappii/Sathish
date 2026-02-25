@echo off
setlocal

cd /d "%~dp0.."

echo [desktop] APP_URL=%APP_URL%

cd /d desktop-app
if not exist node_modules (
  echo [desktop] Installing packages...
  call npm install
)

echo [desktop] Starting Electron...
call npm run start


