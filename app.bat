@echo off
echo === Starting Shop Billing App ===

:: ---------- BACKEND ----------
echo.
echo === Starting Backend ===
start cmd /k ^
"cd /d backend ^
 && if not exist venv (echo Creating venv... & python -m venv venv) ^
 && call venv\Scripts\activate ^
 && echo Installing deps... ^
 && pip install -r requirements.txt ^
 && echo Running FastAPI... ^
 && uvicorn app.main:app --reload"

:: ---------- FRONTEND ----------
echo.
echo === Starting Frontend ===
start cmd /k ^
"cd /d frontend ^
 && if not exist node_modules (echo Installing npm packages... & npm install) ^
 && echo Running frontend... ^
 && npm run dev"

echo.
echo Both windows launched. Check them for errors.
pause
