@echo off
rem Double-clic : ouvre le tableau relais dans ton navigateur (http://127.0.0.1:4747).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable : installe-le depuis https://nodejs.org & pause & exit /b 1)
node tableau\serveur.mjs %*
pause
