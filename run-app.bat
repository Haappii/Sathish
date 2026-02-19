@echo off
setlocal

REM ================================
REM Local Windows runner (dev)
REM - API:            http://localhost:8000
REM - Web UI:         http://localhost:5173
REM - Desktop UI URL: http://localhost:5180  (same web UI on another port)
REM Optional:
REM   set RUN_DESKTOP_APP=1  (starts Electron wrapper too)
REM ================================

if "%BACKEND_HOST%"=="" set BACKEND_HOST=0.0.0.0
if "%BACKEND_PORT%"=="" set BACKEND_PORT=8000
if "%FRONTEND_HOST%"=="" set FRONTEND_HOST=0.0.0.0
if "%FRONTEND_PORT%"=="" set FRONTEND_PORT=5173
if "%DESKTOP_FRONTEND_PORT%"=="" set DESKTOP_FRONTEND_PORT=5180
if "%PUBLIC_HOST%"=="" set PUBLIC_HOST=localhost

set "APP_URL=http://%PUBLIC_HOST%:%DESKTOP_FRONTEND_PORT%"
set "VITE_API_BASE=/api"
set "VITE_WINDOWS_APP_URL=/downloads/poss-desktop-setup.exe"
set "VITE_ANDROID_APK_URL=/downloads/haappii-billing.apk"

echo.
echo API:        http://%PUBLIC_HOST%:%BACKEND_PORT%/api
echo Web UI:     http://%PUBLIC_HOST%:%FRONTEND_PORT%
echo Desktop UI: http://%PUBLIC_HOST%:%DESKTOP_FRONTEND_PORT%
echo APP_URL:    %APP_URL%
echo.

echo Starting Backend...
start "Backend" cmd /k ^
"cd /d backend ^
 && if not exist venv (echo Creating venv... ^& python -m venv venv) ^
 && call venv\Scripts\activate ^
 && if exist requirements.txt (pip install -r requirements.txt) ^
 && uvicorn app.main:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%"

echo Starting Frontend (Web UI)...
start "Frontend Web" cmd /k ^
"cd /d frontend ^
 && if not exist node_modules (echo Installing npm packages... ^& npm install) ^
 && npm run dev -- --strictPort --host %FRONTEND_HOST% --port %FRONTEND_PORT%"

echo Starting Frontend (Desktop UI URL)...
start "Frontend Desktop URL" cmd /k ^
"cd /d frontend ^
 && npm run dev -- --strictPort --host %FRONTEND_HOST% --port %DESKTOP_FRONTEND_PORT%"

if /I "%RUN_DESKTOP_APP%"=="1" (
  echo Starting Desktop App (Electron)...
  start "Desktop App" cmd /k ^
  "cd /d desktop-app ^
   && if not exist node_modules (echo Installing desktop-app packages... ^& npm install) ^
   && npm run start"
)

REM Quick verification links
start "" "http://%PUBLIC_HOST%:%BACKEND_PORT%/docs"
start "" "http://%PUBLIC_HOST%:%FRONTEND_PORT%/about"

echo.
echo Windows launched. Check each window for errors.
pause

endlocal
