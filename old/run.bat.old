@echo off
set CONTAINER_NAME=belabox-receiver
set IMAGE_NAME=belabox-receiver

REM Build image if it doesn't exist
docker image inspect %IMAGE_NAME% >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Building Docker image...
    docker build -t %IMAGE_NAME% .
)

REM Remove existing container (optional if you want clean start every time)
docker rm -f %CONTAINER_NAME% >nul 2>&1

REM Run container in foreground (stops if window closes)
docker run --rm -it --name %CONTAINER_NAME% ^
    -p 5000:5000/udp ^
    -p 8181:8181 ^
    -p 8282:8282/udp ^
    %IMAGE_NAME%
