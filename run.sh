#!/bin/bash

docker build -t belabox-receiver .
docker run --rm -it --name belabox-receiver \
   -p 5000:5000/udp \
   -p 8181:8181/tcp \
   -p 8282:8282/udp \
   belabox-receiver

# SLS stats page:
# http://localhost:8181/stats
#
# Belabox
# host: <ip>
# port: 5000
# stream-id: live/stream/belabox
#
# OBS MediaSource:
# srt://<ip>:8282/?streamid=play/stream/belabox
