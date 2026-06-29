@echo off
setlocal

set "GM_DIR=%~dp0gm-web"
set "GM_URL=http://127.0.0.1:5173"

if not exist "%GM_DIR%" (
  echo [GM] Missing gm-web directory: %GM_DIR%
  pause
  exit /b 1
)

cd /d "%GM_DIR%"

if not exist ".env.local" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env.local" >nul
    echo [GM] Created .env.local automatically
  ) else (
    echo [GM] Missing both .env.local and .env.example, cannot start
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo [GM] Installing dependencies...
  call cmd /c npm install
  if errorlevel 1 (
    echo [GM] Dependency install failed
    pause
    exit /b 1
  )
)

echo [GM] Starting local dev server...
start "GM Dev Server" cmd /k "cd /d %GM_DIR% && cmd /c npm run dev -- --host 127.0.0.1 --port 5173"

echo [GM] Waiting for local server...
set "GM_READY=0"
for /L %%i in (1,1,15) do (
  netstat -ano | findstr "127.0.0.1:5173" >nul
  if not errorlevel 1 (
    set "GM_READY=1"
    goto :openBrowser
  )
  timeout /t 1 /nobreak >nul
)

:openBrowser
echo [GM] Opening browser...
start "" "%GM_URL%"

if "%GM_READY%"=="0" (
  echo [GM] Server is still warming up. Wait a few seconds, then open:
) else (
  echo [GM] Local GM page should now be available at:
)
echo %GM_URL%
exit /b 0
