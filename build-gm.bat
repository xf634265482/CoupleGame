@echo off
setlocal

set "GM_DIR=%~dp0gm-web"

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
    echo [GM] Missing both .env.local and .env.example, cannot build
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

echo [GM] Building static site files...
call cmd /c npm run build
if errorlevel 1 (
  echo [GM] Build failed
  pause
  exit /b 1
)

echo [GM] Build completed. Upload this folder:
echo %GM_DIR%\dist
pause
