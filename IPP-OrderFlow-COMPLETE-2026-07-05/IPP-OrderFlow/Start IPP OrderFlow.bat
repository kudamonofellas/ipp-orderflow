@echo off
title IPP OrderFlow
rem Run from wherever this file lives, so it works on any machine after unzipping.
cd /d "%~dp0"
echo ============================================
echo   Starting IPP OrderFlow...
echo   Your browser will open at localhost:5173
echo.
echo   KEEP THIS WINDOW OPEN while using the app.
echo   To stop the app, just close this window.
echo ============================================
echo.
if not exist "node_modules" (
  echo First run — installing dependencies (one time, needs internet)...
  call npm install
  echo.
)
call npm run dev
echo.
echo (The app stopped. You can close this window.)
pause
