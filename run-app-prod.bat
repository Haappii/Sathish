@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

REM ================================
REM Production runner
REM - API:    http://<PUBLIC_HOST>:<BACKEND_PORT>/api
REM - Web UI: http://<PUBLIC_HOST>:<FRONTEND_PORT>
REM
REM Config read order: .env -> config.example.txt -> config.txt
REM (later files override earlier ones)
REM ================================

for %%F in (".env" "config.example.txt" "config.txt") do (
  if exist %%~F (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (%%~F) do (
      set "ENV_KEY=%%~A"
      set "ENV_VAL=%%~B"
      if defined ENV_KEY (
        for /f "tokens=* delims= " %%K in ("!ENV_KEY!") do set "ENV_KEY=%%~K"
        if /I "!ENV_KEY!"=="PUBLIC_HOST"             set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="BACKEND_HOST"            set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="BACKEND_PORT"            set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="FRONTEND_HOST"           set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="FRONTEND_PORT"           set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="DESKTOP_FRONTEND_PORT"   set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="APP_URL"                 set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="APP_URL_DEFAULT"         set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_API_BASE"           set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_WINDOWS_APP_URL"    set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_ANDROID_APK_URL"    set "!ENV_KEY!=!ENV_VAL!"
        if /I "!ENV_KEY!"=="VITE_IOS_APP_URL"        set "!ENV_KEY!=!ENV_VAL!"
      )
    )
  )
)

REM --- Defaults (fallback if not set in any config file) ---
if "%BACKEND_HOST%"==""    set BACKEND_HOST=0.0.0.0
if "%BACKEND_PORT%"==""    set BACKEND_PORT=8000
if "%FRONTEND_HOST%"==""   set FRONTEND_HOST=0.0.0.0
if "%FRONTEND_PORT%"==""   set FRONTEND_PORT=5173
if "%PUBLIC_HOST%"==""     set PUBLIC_HOST=localhost
if "%VITE_API_BASE%"==""   set VITE_API_BASE=/api

REM --- Pick Python command ---
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

echo.
echo === Production Mode ===
echo API:      http://%PUBLIC_HOST%:%BACKEND_PORT%/api
echo Web UI:   http://%PUBLIC_HOST%:%FRONTEND_PORT%
echo.

REM ================================
REM Preflight: install deps
REM ================================
echo [preflight] Backend venv + requirements...
pushd backend
if not exist venv (
  echo Creating venv...
  %PY_CMD% %PY_VER% -m venv venv
)
call venv\Scripts\activate
python -m pip install --quiet -r requirements.txt
popd

echo [preflight] Frontend node_modules...
pushd frontend
if not exist node_modules (
  echo Installing npm packages...
  call npm install
)

REM ================================
REM Build frontend for production
REM ================================
echo [build] Building frontend...
call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: Frontend build failed. Fix the errors above and re-run.
  echo.
  pause
  exit /b 1
)
popd

REM ================================
REM Start services (production)
REM ================================
echo.
echo Starting Backend (production - no reload)...
start "Backend [PROD]" /D backend cmd /k "call venv\Scripts\activate && python -m uvicorn app.main:app --host %BACKEND_HOST% --port %BACKEND_PORT%"

echo Starting Frontend (production preview)...
start "Frontend [PROD]" /D frontend cmd /k "call npm run preview -- --strictPort --host %FRONTEND_HOST% --port %FRONTEND_PORT%"

echo.
echo Both services launched in separate windows.
echo Check each window for errors before serving traffic.
echo.
echo Keeping this window open. Close it when you are done.
cmd /k

endlocal
exit /b 0
