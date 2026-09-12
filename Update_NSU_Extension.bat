@echo off
setlocal enabledelayedexpansion
title NSU RDS Extension - 1-Click Updater

echo =======================================================
echo       NSU Course Extension - Fetching Updates
echo =======================================================
echo.

set "TARGET_DIR=%USERPROFILE%\Desktop\NSU_Course_Extension"
set "ZIP_PATH=%TEMP%\nsu_ext_update.zip"
set "EXTRACT_DIR=%TEMP%\nsu_ext_update_extract"

if not exist "%TARGET_DIR%" (
    echo [ERROR] NSU_Course_Extension folder not found on Desktop.
    echo Please run Setup_NSU_Extension.bat first!
    pause
    exit /b 1
)

echo [1/3] Downloading latest code from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/tzrahiq/nsu-course-scraper/archive/refs/heads/main.zip' -OutFile '%ZIP_PATH%' -UseBasicParsing"

if not exist "%ZIP_PATH%" (
    echo.
    echo [ERROR] Download failed. Please check your internet connection.
    pause
    exit /b 1
)

echo [2/3] Updating extension files...
if exist "%EXTRACT_DIR%" rmdir /S /Q "%EXTRACT_DIR%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%EXTRACT_DIR%' -Force"

if exist "%EXTRACT_DIR%\nsu-course-scraper-main\extension" (
    xcopy /E /I /Y "%EXTRACT_DIR%\nsu-course-scraper-main\extension\*" "%TARGET_DIR%\" >nul
) else (
    echo [ERROR] Could not locate extension files in archive.
)

echo [3/3] Cleaning up temporary files...
del /F /Q "%ZIP_PATH%" >nul 2>nul
rmdir /S /Q "%EXTRACT_DIR%" >nul 2>nul

echo.
echo =======================================================
echo   SUCCESS! Extension files updated to latest version!
echo =======================================================
echo.
echo To apply updates in Google Chrome:
echo   - If you are on NSU RDS, click "🔄 Reload Extension"
echo     on the blue page banner, OR press Refresh (F5).
echo   - Or go to chrome://extensions and click the 🔄 reload icon
echo     on "NSU Course Scraper & Filter".
echo =======================================================
echo.
pause
