@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   Micro-Expression Video Annotation ^& Clip Extractor
echo   Starting local server...
echo ============================================================
echo.

:: Check Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.10+ and add to PATH.
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Check Python version
for /f "tokens=2 delims= " %%a in ('python --version 2^>^&1') do set PYVER=%%a
for /f "tokens=1,2 delims=." %%a in ("%PYVER%") do (
    if %%a LSS 3 (
        echo [ERROR] Python 3.10+ required. Found: %PYVER%
        pause
        exit /b 1
    )
    if %%a EQU 3 if %%b LSS 10 (
        echo [ERROR] Python 3.10+ required. Found: %PYVER%
        pause
        exit /b 1
    )
)
echo [OK] Python %PYVER%

:: Check FFmpeg
where ffmpeg >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [NOTICE] FFmpeg not found in PATH.
    echo Tool will use OpenCV VideoWriter fallback for clip extraction.
    echo For visually lossless H.264 CRF=10 encoding, install FFmpeg:
    echo   winget install Gyan.FFmpeg
    echo   Or scoop install ffmpeg
    echo.
) else (
    echo [OK] FFmpeg found
)

:: Create virtual environment if needed
if not exist ".venv" (
    echo.
    echo Creating virtual environment...
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
)

:: Activate virtual environment
call .venv\Scripts\activate.bat
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to activate virtual environment
    pause
    exit /b 1
)
echo [OK] Virtual environment activated

:: Upgrade pip
python -m pip install --upgrade pip --quiet 2>nul

:: Install requirements
echo.
echo Installing dependencies...
pip install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed

echo.
echo ============================================================
echo   Starting server at http://127.0.0.1:8000
echo   Press Ctrl+C to stop
echo ============================================================
echo.

:: Open browser
start http://127.0.0.1:8000

:: Start server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

pause
