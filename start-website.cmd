@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "PORT=5173"

pushd "%ROOT%" >nul

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Please install Node.js first.
  popd >nul
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd >nul
    exit /b 1
  )
)

echo [INFO] Starting Vite dev server on http://localhost:%PORT%
call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"
popd >nul
exit /b %EXIT_CODE%
