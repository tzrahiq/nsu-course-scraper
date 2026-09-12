@echo off
setlocal enabledelayedexpansion
title NSU RDS Extension - Publish Updates to Friends

echo =======================================================
echo    NSU Extension Publisher - Push Updates to Friends
echo =======================================================
echo.

:: Check if git is available
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    pause
    exit /b 1
)

echo [1/3] Staging modified files...
git add .

echo.
set /p "COMMIT_MSG=Enter update note (or press Enter for 'Feature updates and improvements'): "
if "!COMMIT_MSG!"=="" set "COMMIT_MSG=Feature updates and improvements"

echo.
echo [2/3] Committing changes: "!COMMIT_MSG!"...
git commit -m "!COMMIT_MSG!"
if %ERRORLEVEL% neq 0 (
    echo [INFO] No new changes to commit. Pushing existing commits...
)

echo.
echo [3/3] Pushing to GitHub (tzrahiq/nsu-course-scraper)...
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================
    echo   SUCCESS! Updates are live on GitHub!
    echo   Your friends with Auto-Sync will receive this update
    echo   within 30-60 seconds automatically.
    echo =======================================================
) else (
    echo.
    echo [ERROR] Failed to push to GitHub. Please check your internet or git connection.
)

echo.
pause
