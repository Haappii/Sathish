@echo off
setlocal

REM Debug runner that never auto-closes and writes a log file.
REM Use this if double-clicking run-app.bat closes too quickly to read errors.

cd /d "%~dp0"

set "LOG_FILE=%~dp0run-app-debug.log"
echo ================================================== > "%LOG_FILE%"
echo run-app-debug started: %date% %time%>> "%LOG_FILE%"
echo Working dir: %cd%>> "%LOG_FILE%"
echo ==================================================>> "%LOG_FILE%"

REM Let this wrapper handle keeping the window open.
set "KEEP_RUNNER_OPEN=0"

echo Running run-app.bat...
echo Logging to: "%LOG_FILE%"
echo.

call "%~dp0run-app.bat" >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%errorlevel%"

echo.
echo run-app.bat exited with code: %EXIT_CODE%
echo Log file: "%LOG_FILE%"
echo.
echo If you still see no error here, open the log file and share the last 30 lines.
pause



