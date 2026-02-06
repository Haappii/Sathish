@echo off

echo Starting Backend...
start cmd /k "cd backend && venv\Scripts\activate && uvicorn app.main:app --reload"

echo Starting Frontend...
start cmd /k "cd frontend && npm run dev"
