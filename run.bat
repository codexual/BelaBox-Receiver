@echo off
setlocal EnableDelayedExpansion

:: Usage: run.bat [--rebuild] [--detach] [INSTANCE]
::
::   INSTANCE  Receiver number (default: 1).
::             1  = main receiver: ports 5000/8181/8282, runs NOALBS.
::             2+ = extra receiver: every port shifted by INSTANCE-1, NOALBS off.
::                  e.g. 2 -> 5001/8182/8283, 3 -> 5002/8183/8284
::   --rebuild Force a full rebuild of the image.
::   --detach  Run in the background (needed to start several from one window).
::
:: Each instance reads its own SLS config, mounted over /etc/sls/sls.conf:
::   instance 1 -> files\sls.conf, instance N -> files\sls-N.conf
:: Edit the file and restart the container. No rebuild needed.

set IMAGE_NAME=belabox-receiver
set INSTANCE=1
set REBUILD=0
set DETACH=0

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--rebuild" (
    set REBUILD=1
) else if /i "%~1"=="--detach" (
    set DETACH=1
) else if /i "%~1"=="-d" (
    set DETACH=1
) else (
    set "ARG=%~1"
    set "NONNUM="
    for /f "delims=0123456789" %%a in ("!ARG!") do set "NONNUM=%%a"
    if defined NONNUM (
        echo Unknown argument: %~1
        echo Usage: run.bat [--rebuild] [--detach] [INSTANCE]
        exit /b 1
    )
    set /a INSTANCE=!ARG!
)
shift
goto parse_args
:args_done

if %INSTANCE% LSS 1 (
    echo INSTANCE must be 1 or higher.
    exit /b 1
)

set /a OFFSET=INSTANCE-1
set /a SRTLA_PORT=5000+OFFSET
set /a STATS_PORT=8181+OFFSET
set /a SRT_PORT=8282+OFFSET

if %INSTANCE% EQU 1 (
    set CONTAINER_NAME=belabox-receiver
    set ENABLE_NOALBS=true
    set SLS_CONF=sls.conf
) else (
    set CONTAINER_NAME=belabox-receiver-%INSTANCE%
    set ENABLE_NOALBS=false
    set SLS_CONF=sls-%INSTANCE%.conf
)

set "SLS_CONF_PATH=%~dp0files\%SLS_CONF%"
if not exist "%SLS_CONF_PATH%" (
    echo Missing files\%SLS_CONF%. Create it first, for example: copy files\sls.conf files\%SLS_CONF%
    exit /b 1
)

echo ========================================
echo Belabox Receiver Docker Manager
echo ========================================

:: Build logic
if %REBUILD% EQU 1 (
    echo Forcing full rebuild...
    docker build --no-cache -t %IMAGE_NAME% .
) else (
    docker image inspect %IMAGE_NAME% >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo Building Docker image for the first time...
        docker build -t %IMAGE_NAME% .
    ) else (
        echo Image already exists. Use --rebuild to force rebuild.
    )
)

:: Check if build was successful
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo ERROR: Docker build failed^^!
    echo Please check the error messages above.
    pause
    exit /b 1
)

:: Remove existing container
docker rm -f %CONTAINER_NAME% >nul 2>&1

echo.
echo Starting container %CONTAINER_NAME% (instance %INSTANCE%)...
echo Ports: %SRTLA_PORT%/udp (SRTLA ingest), %STATS_PORT% (SLS stats), %SRT_PORT%/udp (SRT)
echo NOALBS: %ENABLE_NOALBS%
echo SLS config: files\%SLS_CONF%
echo.

if %DETACH% EQU 1 (
    docker run -d --rm --name %CONTAINER_NAME% ^
        -e ENABLE_NOALBS=%ENABLE_NOALBS% ^
        -e OBS_SRT_PORT=%SRT_PORT% ^
        -v "%SLS_CONF_PATH%:/etc/sls/sls.conf:ro" ^
        -p %SRTLA_PORT%:5000/udp ^
        -p %STATS_PORT%:8181 ^
        -p %SRT_PORT%:8282/udp ^
        %IMAGE_NAME%
    echo Running in background. Logs: docker logs -f %CONTAINER_NAME%   Stop: docker stop %CONTAINER_NAME%
    exit /b 0
)

echo Press Ctrl+C to stop.
echo.

docker run --rm -it --name %CONTAINER_NAME% ^
    -e ENABLE_NOALBS=%ENABLE_NOALBS% ^
    -e OBS_SRT_PORT=%SRT_PORT% ^
    -v "%SLS_CONF_PATH%:/etc/sls/sls.conf:ro" ^
    -p %SRTLA_PORT%:5000/udp ^
    -p %STATS_PORT%:8181 ^
    -p %SRT_PORT%:8282/udp ^
    %IMAGE_NAME%

echo.
echo Container has stopped.
pause
