@echo off
setlocal
cd /d "%~dp0"
title OurVerse - All In One
cls
echo ================================================
echo          OURVERSE - COMPLETE WEBSITE
echo ================================================
echo.
echo Project folder: %CD%
echo.
if not exist "index.html" (
  echo ERROR: Extract the whole ZIP before running this launcher.
  pause
  exit /b 1
)
if not exist "models\boy.glb" (echo ERROR: boy.glb is missing & pause & exit /b 1)
if not exist "models\girl.glb" (echo ERROR: girl.glb is missing & pause & exit /b 1)
echo Three.js loads directly from a CDN. No npm installation needed.
echo Internet is needed for the 3D engine.
echo.
echo OPEN: http://localhost:8947/index.html
echo CHECK: http://localhost:8947/check.html
echo.
echo Keep this window OPEN while using the website.
echo Press Ctrl+C to stop the server.
echo.
where node >nul 2>&1
if not errorlevel 1 (
  node "%~dp0server.cjs"
  goto end
)
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -m http.server 8947 --bind 127.0.0.1 --directory "%~dp0"
  goto end
)
where python >nul 2>&1
if not errorlevel 1 (
  python -m http.server 8947 --bind 127.0.0.1 --directory "%~dp0"
  goto end
)
echo.
echo ERROR: Install Python or Node.js to host the local website.
echo Python: https://www.python.org/downloads/
:end
echo.
echo Server exited. If unexpected, screenshot this black window.
pause
