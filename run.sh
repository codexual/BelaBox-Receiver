#!/bin/bash

CONTAINER_NAME="belabox-receiver"
IMAGE_NAME="belabox-receiver"

echo "========================================"
echo "Belabox Receiver Docker Manager"
echo "========================================"

# Build if image doesn't exist or --rebuild is used
if [ "$1" = "--rebuild" ] || ! docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
    if [ "$1" = "--rebuild" ]; then
        echo "Forcing full rebuild..."
        docker build --no-cache -t "$IMAGE_NAME" .
    else
        echo "Building Docker image..."
        docker build -t "$IMAGE_NAME" .
    fi
else
    echo "Image already exists. Use --rebuild to force rebuild."
fi

# Remove existing container if running
docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1

echo
echo "Starting container..."
echo "Ports: 5000/udp (SRT), 8181 (NOALBS), 8282/udp (SRTLA)"
echo "Press Ctrl+C to stop."
echo

docker run --rm -it --name "$CONTAINER_NAME" \
    -p 5000:5000/udp \
    -p 8181:8181 \
    -p 8282:8282/udp \
    "$IMAGE_NAME"

echo
echo "Container stopped."
