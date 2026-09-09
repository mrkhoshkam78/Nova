@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Nova Gateway - Starting...
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not found!
  echo Install Python from https://www.python.org/downloads/
  echo During install, CHECK "Add Python to PATH"
  pause
  exit /b 1
)

echo [1/3] Installing packages...
python -m pip install -q fastapi uvicorn openai python-dotenv pydantic httpx
if errorlevel 1 (
  echo [ERROR] pip install failed
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] File .env not found!
  echo Create .env with your Groq API key. See SETUP.txt
  pause
  exit /b 1
)

echo [2/3] Checking .env ...
findstr /C:"gsk_" .env >nul 2>&1
if errorlevel 1 (
  findstr /C:"sk-" .env >nul 2>&1
  if errorlevel 1 (
    echo [WARN] API key may be missing in .env
  )
)

echo [3/3] Starting server on http://127.0.0.1:8000
echo.
echo *** DO NOT CLOSE THIS WINDOW ***
echo Open index.html in your browser after this starts.
echo Press Ctrl+C to stop.
echo.
python -m uvicorn server:app --host 127.0.0.1 --port 8000
pause
