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

REM Pick Python command
set "PY_CMD=python"
set "PY_VER="
where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo.
    echo ERROR: Python not found. Install Python 3 and ensure it is in PATH.
    echo.
    pause
    exit /b 1
  )
  set "PY_CMD=py"
  set "PY_VER=-3"
)

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
start "Backend" cmd /k "cd /d backend & echo [backend] Using %PY_CMD% %PY_VER% & if not exist venv (echo [backend] Creating venv... & %PY_CMD% %PY_VER% -m venv venv) & call venv\\Scripts\\activate & echo [backend] Installing deps... & python -m pip install -r requirements.txt & echo [backend] Starting API... & python -m uvicorn app.main:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%"

echo Starting Frontend (Web UI)...
start "Frontend Web" cmd /k "cd /d frontend & echo [web] Installing npm packages (if needed)... & if not exist node_modules (npm install) & echo [web] Starting Vite on %FRONTEND_PORT%... & npm run dev -- --strictPort --host %FRONTEND_HOST% --port %FRONTEND_PORT%"

echo Starting Frontend (Desktop UI URL)...
start "Frontend Desktop URL" cmd /k "cd /d frontend & echo [desktop-url] Starting Vite on %DESKTOP_FRONTEND_PORT%... & npm run dev -- --strictPort --host %FRONTEND_HOST% --port %DESKTOP_FRONTEND_PORT%"

if /I "%RUN_DESKTOP_APP%"=="1" (
  echo Starting Desktop App (Electron)...
  start "Desktop App" cmd /k "cd /d desktop-app & echo [desktop] APP_URL=%APP_URL% & if not exist node_modules (echo [desktop] Installing packages... & npm install) & echo [desktop] Starting Electron... & npm run start"
)

REM Quick verification links
start "" "http://%PUBLIC_HOST%:%BACKEND_PORT%/docs"
start "" "http://%PUBLIC_HOST%:%FRONTEND_PORT%/about"

echo.
echo Windows launched. Check each window for errors.
pause

endlocal
