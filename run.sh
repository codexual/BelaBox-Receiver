#!/bin/bash
#
# Usage: ./run.sh [--rebuild] [--detach] [INSTANCE]
#
#   INSTANCE  Receiver number (default: 1).
#             1  = main receiver: ports 5000/8181/8282, runs NOALBS.
#             2+ = extra receiver: every port shifted by INSTANCE-1, NOALBS off.
#                  e.g. 2 -> 5001/8182/8283, 3 -> 5002/8183/8284
#   --rebuild Force a full rebuild of the image.
#   --detach  Run in the background (needed to start several from one terminal).
#
# Each instance reads its own SLS config, mounted over /etc/sls/sls.conf:
#   instance 1 -> files/sls.conf, instance N -> files/sls-N.conf
# Edit the file and restart the container. No rebuild needed.

IMAGE_NAME="belabox-receiver"
INSTANCE=1
REBUILD=0
DETACH=0

for arg in "$@"; do
    case "$arg" in
        --rebuild) REBUILD=1 ;;
        -d|--detach) DETACH=1 ;;
        ''|*[!0-9]*) echo "Unknown argument: $arg"; echo "Usage: $0 [--rebuild] [--detach] [INSTANCE]"; exit 1 ;;
        *) INSTANCE="$arg" ;;
    esac
done

if [ "$INSTANCE" -lt 1 ]; then
    echo "INSTANCE must be 1 or higher."
    exit 1
fi

OFFSET=$((INSTANCE - 1))
SRTLA_PORT=$((5000 + OFFSET))
STATS_PORT=$((8181 + OFFSET))
SRT_PORT=$((8282 + OFFSET))

if [ "$INSTANCE" -eq 1 ]; then
    CONTAINER_NAME="belabox-receiver"
    ENABLE_NOALBS=true
    SLS_CONF="files/sls.conf"
else
    CONTAINER_NAME="belabox-receiver-$INSTANCE"
    ENABLE_NOALBS=false
    SLS_CONF="files/sls-$INSTANCE.conf"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$SCRIPT_DIR/$SLS_CONF" ]; then
    echo "Missing $SLS_CONF. Create it first, for example: cp files/sls.conf $SLS_CONF"
    exit 1
fi

echo "========================================"
echo "Belabox Receiver Docker Manager"
echo "========================================"

# Build if image doesn't exist or --rebuild is used
if [ "$REBUILD" -eq 1 ]; then
    echo "Forcing full rebuild..."
    docker build --no-cache -t "$IMAGE_NAME" . || exit 1
elif ! docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
    echo "Building Docker image..."
    docker build -t "$IMAGE_NAME" . || exit 1
else
    echo "Image already exists. Use --rebuild to force rebuild."
fi

# Remove existing container if running
docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1

echo
echo "Starting container $CONTAINER_NAME (instance $INSTANCE)..."
echo "Ports: $SRTLA_PORT/udp (SRTLA ingest), $STATS_PORT (SLS stats), $SRT_PORT/udp (SRT)"
echo "NOALBS: $ENABLE_NOALBS"
echo "SLS config: $SLS_CONF"
echo

if [ "$DETACH" -eq 1 ]; then
    docker run -d --rm --name "$CONTAINER_NAME" \
        -e ENABLE_NOALBS="$ENABLE_NOALBS" \
        -e OBS_SRT_PORT="$SRT_PORT" \
        -v "$SCRIPT_DIR/$SLS_CONF":/etc/sls/sls.conf:ro \
        -p "$SRTLA_PORT":5000/udp \
        -p "$STATS_PORT":8181 \
        -p "$SRT_PORT":8282/udp \
        "$IMAGE_NAME" || exit 1
    echo "Running in background. Logs: docker logs -f $CONTAINER_NAME   Stop: docker stop $CONTAINER_NAME"
else
    echo "Press Ctrl+C to stop."
    echo
    docker run --rm -it --name "$CONTAINER_NAME" \
        -e ENABLE_NOALBS="$ENABLE_NOALBS" \
        -e OBS_SRT_PORT="$SRT_PORT" \
        -v "$SCRIPT_DIR/$SLS_CONF":/etc/sls/sls.conf:ro \
        -p "$SRTLA_PORT":5000/udp \
        -p "$STATS_PORT":8181 \
        -p "$SRT_PORT":8282/udp \
        "$IMAGE_NAME"
    echo
    echo "Container stopped."
fi
