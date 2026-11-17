@echo off
title Jacki Platform Server (v4.0)
echo ==================================================
echo   Starting Jacki (جاكي) Platform Server v4.0
echo ==================================================
if not exist "node_modules" (
    echo Installing required packages...
    call npm install
)
echo Starting Jacki server on http://localhost:3000 ...
start http://localhost:3000/auth.html
node server.js
pause
