@echo off
title MIT CORER Library System
color 0A

echo ============================================
echo    MIT College Library System - Starting...
echo ============================================
echo.

REM --- Start Node.js server in a new window ---
echo [1/2] Starting Node.js Server (Port 5000)...
start "Node Server" cmd /k "cd /d %~dp0 && node server.js"

REM --- Wait 3 seconds for Node to boot first ---
timeout /t 3 /nobreak >nul

REM --- Start Python Face Recognition server ---
echo [2/2] Starting Face Recognition Server (Port 5001)...
start "Face Recognition" cmd /k "cd /d %~dp0 && python Face_recognition_model.py"

echo.
echo ============================================
echo  Both servers are running!
echo  Open your browser to: http://localhost:5000
echo ============================================
echo.

REM --- Auto-open the browser ---
timeout /t 4 /nobreak >nul
start http://localhost:5000/log.html

pause