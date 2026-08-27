@echo off
setlocal EnableExtensions EnableDelayedExpansion

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-share.ps1" %*
set "share_exit_code=%ERRORLEVEL%"

if not "%share_exit_code%"=="0" (
  echo.
  echo Share update failed. Review the error above.
  exit /b %share_exit_code%
)

if /i "%~1"=="status" exit /b 0
if /i "%~1"=="stop" exit /b 0

set "share_url="
if exist "%~dp0.tools\share-url.txt" set /p share_url=<"%~dp0.tools\share-url.txt"
echo.
echo Updated successfully.
echo Public URL: !share_url!
echo Run update-share.cmd again after editing the site.

exit /b 0
