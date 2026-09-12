@echo off
setlocal enabledelayedexpansion
title NSU RDS Extension - Friend Auto-Installer

echo =======================================================
echo   NSU Course Scraper & Routine Builder - Quick Setup
echo =======================================================
echo.
echo Setting up the extension directly on your Desktop...
echo (No Git or Python required)
echo.

set "TARGET_DIR=%USERPROFILE%\Desktop\NSU_Course_Extension"
set "ZIP_PATH=%TEMP%\nsu_ext_repo.zip"
set "EXTRACT_DIR=%TEMP%\nsu_ext_extract"

echo [1/4] Downloading latest extension from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/tzrahiq/nsu-course-scraper/archive/refs/heads/main.zip' -OutFile '%ZIP_PATH%'"

if not exist "%ZIP_PATH%" (
    echo.
    echo [ERROR] Failed to download extension. Please check your internet connection!
    pause
    exit /b 1
)

echo [2/4] Extracting extension files...
if exist "%EXTRACT_DIR%" rmdir /S /Q "%EXTRACT_DIR%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%EXTRACT_DIR%' -Force"

if not exist "%EXTRACT_DIR%\nsu-course-scraper-main\extension" (
    echo.
    echo [ERROR] Failed to unpack extension directory!
    pause
    exit /b 1
)

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
xcopy /E /I /Y "%EXTRACT_DIR%\nsu-course-scraper-main\extension\*" "%TARGET_DIR%\" >nul

:: Also copy Update and AutoSync scripts directly to Desktop for quick access
if exist "%EXTRACT_DIR%\nsu-course-scraper-main\Update_NSU_Extension.bat" (
    copy /Y "%EXTRACT_DIR%\nsu-course-scraper-main\Update_NSU_Extension.bat" "%USERPROFILE%\Desktop\" >nul
)
if exist "%EXTRACT_DIR%\nsu-course-scraper-main\AutoSync_NSU_Extension.bat" (
    copy /Y "%EXTRACT_DIR%\nsu-course-scraper-main\AutoSync_NSU_Extension.bat" "%USERPROFILE%\Desktop\" >nul
)

echo [3/4] Cleaning up temporary files...
del /F /Q "%ZIP_PATH%" >nul 2>nul
rmdir /S /Q "%EXTRACT_DIR%" >nul 2>nul

echo [4/4] Launching Chrome Extensions page...
start chrome.exe "chrome://extensions" 2>nul

echo.
echo =======================================================
echo               INSTALLATION COMPLETE!
echo =======================================================
echo.
echo Extension folder created at:
echo   %TARGET_DIR%
echo.
echo Final 2 steps in Google Chrome:
echo   1. Turn ON "Developer mode" (toggle in top right corner).
echo   2. Click "Load unpacked" (top left button) and select:
echo      Desktop -> NSU_Course_Extension
echo.
echo -------------------------------------------------------
echo REAL-TIME UPDATES FOR FRIENDS:
echo   - Run "AutoSync_NSU_Extension.bat" on your Desktop to
echo     auto-sync new features the moment they are pushed!
echo   - Or double-click "Update_NSU_Extension.bat" anytime.
echo =======================================================
echo.
pause
