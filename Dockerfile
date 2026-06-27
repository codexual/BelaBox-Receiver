FROM debian:bookworm AS builder
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV DEBIAN_FRONTEND=noninteractive

RUN set -xe; \
    apt-get update && \
    apt-get -y upgrade && \
    apt-get install -y \
    build-essential \
    ca-certificates \
    cmake \
    git \
    libssl-dev \
    libz-dev \
    tcl \
    && rm -rf /var/lib/apt/lists/*

# belabox patched srt
ARG BELABOX_SRT_VERSION=master
RUN set -xe; \
    mkdir -p /build; \
    git clone https://github.com/BELABOX/srt.git /build/srt; \
    cd /build/srt; \
    git checkout $BELABOX_SRT_VERSION; \
    ./configure --prefix=/usr/local; \
    make -j4; \
    make install; \
    ldconfig;

# belabox srtla
ARG SRTLA_VERSION=main
RUN set -xe; \
    mkdir -p /build; \
    git clone https://github.com/BELABOX/srtla.git /build/srtla; \
    cd /build/srtla; \
    git checkout $SRTLA_VERSION; \
    make -j4;

RUN cp /build/srtla/srtla_rec /build/srtla/srtla_send /usr/local/bin

# srt-live-server with time.h fix
COPY patches/sls-SRTLA.patch \
     patches/sls-version.patch \
     patches/480f73dd17320666944d3864863382ba63694046.patch /tmp/

ARG SRT_LIVE_SERVER_VERSION=master
RUN set -xe; \
    mkdir -p /build; \
    git clone https://github.com/IRLDeck/srt-live-server.git /build/srt-live-server; \
    cd /build/srt-live-server; \
    git checkout $SRT_LIVE_SERVER_VERSION; \
    patch -p1 < /tmp/sls-SRTLA.patch; \
    patch -p1 < /tmp/480f73dd17320666944d3864863382ba63694046.patch; \
    sed -i '1i#include <time.h>' slscore/common.cpp; \
    LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH make -j4; \
    cp bin/* /usr/local/bin;

# ====================== RUNTIME STAGE ======================
FROM debian:bookworm

RUN set -xe; \
    apt-get update && \
    apt-get -y upgrade && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    lsof \
    nodejs \
    npm \
    procps \
    supervisor \
    net-tools \
    wget \
    zip \
    unzip \
    nano \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib /usr/local/lib
COPY --from=builder /usr/local/include /usr/local/include
COPY --from=builder /usr/local/bin /usr/local/bin

COPY files/sls.conf /etc/sls/sls.conf
COPY files/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY files/logprefix /usr/local/bin/logprefix

RUN set -xe; \
    ldconfig; \
    chmod 755 /usr/local/bin/logprefix;

# NOALBS v2.17.0 (Rust)
ARG NOALBS_VERSION=v2.17.0
RUN set -xe; \
    git clone https://github.com/715209/nginx-obs-automatic-low-bitrate-switching /app; \
    cd /app; \
    git checkout $NOALBS_VERSION; \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; \
    . "$HOME/.cargo/env"; \
    cargo build --release; \
    cp target/release/noalbs /usr/local/bin/noalbs; \
    chmod +x /usr/local/bin/noalbs;

# Copy your config files
COPY files/.env files/config.json /app/

EXPOSE 5000/udp 8181/tcp 8282/udp
CMD ["/usr/bin/supervisord"]
