@echo off
setlocal EnableDelayedExpansion

set CONTAINER_NAME=belabox-receiver
set IMAGE_NAME=belabox-receiver

echo ========================================
echo Belabox Receiver Docker Manager
echo ========================================

:: Build logic
if "%1"=="--rebuild" (
    echo Forcing full rebuild...
    docker build --no-cache -t %IMAGE_NAME% .
) else (
    docker image inspect %IMAGE_NAME% >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo Building Docker image for the first time...
        docker build -t %IMAGE_NAME% .
    ) else (
        echo Image already exists. Use --rebuild to force rebuild.
    )
)

:: Check if build was successful
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Docker build failed^^!
    echo Please check the error messages above.
    pause
    exit /b 1
) else (
    echo Build completed successfully^^!
)

:: Remove existing container
docker rm -f %CONTAINER_NAME% >nul 2>&1

echo.
echo Starting container...
echo Ports: 5000/udp (SRT), 8181 (NOALBS), 8282/udp (SRTLA)
echo Press Ctrl+C to stop.
echo.

docker run --rm -it --name %CONTAINER_NAME% ^
    -p 5000:5000/udp ^
    -p 8181:8181 ^
    -p 8282:8282/udp ^
    %IMAGE_NAME%

echo.
echo Container has stopped.
pause
