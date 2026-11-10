@echo off
title Launching StudySync Deep Learning Project
echo ======================================================================
echo   Starting StudySync: Deep Learning Lecture-to-Notes Engine
echo ======================================================================
echo.

echo [1/3] Starting Python Deep Learning Microservice (FastAPI, Port 8000)...
start "StudySync - Python DL Engine" cmd /k "cd /d "%~dp0dl_service" && python app.py"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Node Express Server (Port 5000)...
start "StudySync - Express Gateway" cmd /k "cd /d "%~dp0server" && npm run dev"

timeout /t 2 /nobreak >nul

echo [3/3] Starting React Client (Port 5173)...
start "StudySync - Frontend UI" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo All services launched! Opening web browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:5173
