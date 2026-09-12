@echo off
setlocal enabledelayedexpansion
title NSU RDS Extension - Real-Time AutoSync Daemon

echo =======================================================
echo    NSU Extension AutoSync - Real-Time Sync Daemon
echo =======================================================
echo.
echo Watching for updates from GitHub (tzrahiq/nsu-course-scraper)...
echo Keep this window open or minimized while using the extension.
echo Press Ctrl+C at any time to stop.
echo.

set "TARGET_DIR=%USERPROFILE%\Desktop\NSU_Course_Extension"

if not exist "%TARGET_DIR%" (
    echo [ERROR] NSU_Course_Extension folder not found on Desktop.
    echo Please run Setup_NSU_Extension.bat first!
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$targetDir = [System.Environment]::ExpandEnvironmentVariables('%TARGET_DIR%');" ^
  "$commitFile = Join-Path $targetDir '.last_commit';" ^
  "$apiUrl = 'https://api.github.com/repos/tzrahiq/nsu-course-scraper/commits/main';" ^
  "$zipUrl = 'https://github.com/tzrahiq/nsu-course-scraper/archive/refs/heads/main.zip';" ^
  "$tempZip = Join-Path [System.IO.Path]::GetTempPath() 'nsu_autosync.zip';" ^
  "$tempExtract = Join-Path [System.IO.Path]::GetTempPath() 'nsu_autosync_ext';" ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "Write-Host '[INFO] AutoSync daemon running. Polling GitHub every 30 seconds...' -ForegroundColor Cyan;" ^
  "while ($true) {" ^
  "  try {" ^
  "    $res = Invoke-RestMethod -Uri $apiUrl -Headers @{'User-Agent'='NSUAutoSync'; 'Cache-Control'='no-cache'} -TimeoutSec 10;" ^
  "    $latestSha = $res.sha;" ^
  "    $time = (Get-Date).ToString('HH:mm:ss');" ^
  "    if (-not (Test-Path $commitFile)) {" ^
  "      Set-Content -Path $commitFile -Value $latestSha -Force;" ^
  "      Write-Host \"[$time] Initialized sync baseline at commit: $($latestSha.Substring(0, 7))\" -ForegroundColor Cyan;" ^
  "    } else {" ^
  "      $lastSha = (Get-Content $commitFile -Raw).Trim();" ^
  "      if ($latestSha -and ($latestSha -ne $lastSha)) {" ^
  "        Write-Host \"[$time] 🔔 New update detected: $($latestSha.Substring(0, 7)) - Downloading...\" -ForegroundColor Yellow;" ^
  "        $ProgressPreference = 'SilentlyContinue';" ^
  "        Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing;" ^
  "        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force | Out-Null };" ^
  "        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force;" ^
  "        $srcDir = Join-Path $tempExtract 'nsu-course-scraper-main\extension';" ^
  "        if (Test-Path $srcDir) {" ^
  "          Copy-Item -Path \"$srcDir\*\" -Destination $targetDir -Recurse -Force;" ^
  "          Set-Content -Path $commitFile -Value $latestSha -Force;" ^
  "          Write-Host \"[$time] ✅ Extension updated successfully! Click 'Reload Extension' on RDS or in chrome://extensions.\" -ForegroundColor Green;" ^
  "        };" ^
  "        if (Test-Path $tempZip) { Remove-Item $tempZip -Force | Out-Null };" ^
  "        if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force | Out-Null };" ^
  "      }" ^
  "    }" ^
  "  } catch {" ^
  "    # Silent fallback on temporary network glitch or rate limits" ^
  "  };" ^
  "  Start-Sleep -Seconds 30;" ^
  "}"

