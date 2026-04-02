@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

for %%F in (".env" "config.example.txt" "config.txt") do (
  if exist %%~F (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (%%~F) do (
      set "ENV_KEY=%%~A"
      set "ENV_VAL=%%~B"
      if defined ENV_KEY (
        for /f "tokens=* delims= " %%K in ("!ENV_KEY!") do set "ENV_KEY=%%~K"
        if /I "!ENV_KEY!"=="PUBLIC_HOST" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="BACKEND_HOST" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="BACKEND_PORT" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="FRONTEND_HOST" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="FRONTEND_PORT" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="DESKTOP_FRONTEND_PORT" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="APP_URL" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="APP_URL_DEFAULT" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_API_BASE" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_WINDOWS_APP_URL" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_ANDROID_APK_URL" set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_IOS_APP_URL" set "!ENV_KEY!=!ENV_VAL!"
      )
    )
  )
)

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

if "%APP_URL%"=="" set "APP_URL=http://%PUBLIC_HOST%:%DESKTOP_FRONTEND_PORT%"
if "%VITE_API_BASE%"=="" set "VITE_API_BASE=/api"
if "%VITE_WINDOWS_APP_URL%"=="" set "VITE_WINDOWS_APP_URL=/downloads/poss-desktop-setup.exe"
if "%VITE_ANDROID_APK_URL%"=="" set "VITE_ANDROID_APK_URL=/downloads/haappii-billing.apk"

REM Optional:
REM   set KEEP_RUNNER_OPEN=1 (keep this launcher window open)
if "%KEEP_RUNNER_OPEN%"=="" set KEEP_RUNNER_OPEN=1

echo.
echo API:        http://%PUBLIC_HOST%:%BACKEND_PORT%/api
echo Web UI:     http://%PUBLIC_HOST%:%FRONTEND_PORT%
echo Desktop UI: http://%PUBLIC_HOST%:%DESKTOP_FRONTEND_PORT%
echo APP_URL:    %APP_URL%
echo KEEP_OPEN:  %KEEP_RUNNER_OPEN%
echo.

REM ================================
REM Preflight: ensure deps are installed (once)
REM ================================
echo Preflight: Backend venv + requirements...
pushd backend
if not exist venv (
  echo [preflight][backend] Creating venv...
  %PY_CMD% %PY_VER% -m venv venv
)
call venv\\Scripts\\activate
python -m pip install -r requirements.txt
popd

echo Preflight: Frontend node_modules...
pushd frontend
if not exist node_modules (
  echo [preflight][frontend] Installing npm packages...
  call npm install
)
popd

REM ================================
REM Start services
REM ================================
echo Starting Backend...
start "Backend" /D backend cmd /k "call venv\\Scripts\\activate && python -m uvicorn app.main:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%"

echo Starting Frontend (Web UI)...
start "Frontend Web" /D frontend cmd /k "call npm run dev -- --strictPort --host %FRONTEND_HOST% --port %FRONTEND_PORT%"

echo Starting Frontend (Desktop UI URL)...
start "Frontend Desktop URL" /D frontend cmd /k "call npm run dev -- --strictPort --host %FRONTEND_HOST% --port %DESKTOP_FRONTEND_PORT%"

if /I "%RUN_DESKTOP_APP%"=="1" (
  echo Starting Desktop App (Electron)...
  start "Desktop App" cmd /k "call scripts\\start-desktop-app.cmd"
)

REM Quick verification links
start "" "http://%PUBLIC_HOST%:%BACKEND_PORT%/docs"
start "" "http://%PUBLIC_HOST%:%FRONTEND_PORT%/about"

echo.
echo Windows launched. Check each window for errors.
if "%KEEP_RUNNER_OPEN%"=="1" (
  echo.
  echo Keeping this window open for status. Close it when you are done.
  cmd /k
)

endlocal
exit /b 0




