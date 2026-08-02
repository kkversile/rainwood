@echo off
setlocal
cd /d %~dp0\backend
call npm install || exit /b 1
call npx prisma generate || exit /b 1
cd /d %~dp0\frontend
call npm install || exit /b 1
echo Installation completed. Configure .env files and PostgreSQL, then run each app separately.
