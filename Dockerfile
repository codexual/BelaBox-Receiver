# -------- BUILDER STAGE --------
FROM debian:bullseye-backports AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get install -y \
        build-essential \
        ca-certificates \
        cmake \
        git \
        libssl-dev \
        libz-dev \
        tcl && \
    rm -rf /var/lib/apt/lists/*

# ---- Build BELABOX patched SRT ----
ARG BELABOX_SRT_VERSION=master
RUN git clone --branch $BELABOX_SRT_VERSION https://github.com/BELABOX/srt.git /build/srt && \
    cd /build/srt && \
    ./configure --prefix=/usr/local && \
    make -j4 && \
    make install && \
    ldconfig

# ---- Build SRTLA ----
ARG SRTLA_VERSION=main
RUN git clone --branch $SRTLA_VERSION https://github.com/BELABOX/srtla.git /build/srtla && \
    cd /build/srtla && \
    make -j4 && \
    cp srtla_rec srtla_send /usr/local/bin

# ---- Build SRT Live Server with patches ----
COPY patches/sls-SRTLA.patch \
     patches/sls-version.patch \
     patches/480f73dd17320666944d3864863382ba63694046.patch /tmp/

ARG SRT_LIVE_SERVER_VERSION=master
RUN git clone --branch $SRT_LIVE_SERVER_VERSION https://github.com/IRLDeck/srt-live-server.git /build/srt-live-server && \
    cd /build/srt-live-server && \
    patch -p1 < /tmp/sls-SRTLA.patch && \
    patch -p1 < /tmp/480f73dd17320666944d3864863382ba63694046.patch && \
    LD_LIBRARY_PATH=/usr/local/lib make -j4 && \
    cp bin/* /usr/local/bin


# -------- RUNTIME STAGE --------
FROM debian:bullseye-backports

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
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
    nano && \
    rm -rf /var/lib/apt/lists/*

# Copy built libraries and binaries
COPY --from=builder /usr/local/lib /usr/local/lib
COPY --from=builder /usr/local/include /usr/local/include
COPY --from=builder /usr/local/bin /usr/local/bin

# Config and scripts
COPY files/sls.conf /etc/sls/sls.conf
COPY files/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY files/logprefix /usr/local/bin/logprefix

RUN chmod 755 /usr/local/bin/logprefix && ldconfig

# Install NOALBS binary
ARG NOALBS_VERSION=v2.13.1
RUN wget https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching/releases/download/${NOALBS_VERSION}/noalbs-${NOALBS_VERSION}-x86_64-unknown-linux-musl.tar.gz -O /tmp/noalbs.tar.gz && \
    mkdir -p /app && \
    tar -xzf /tmp/noalbs.tar.gz -C /tmp && \
    mv /tmp/noalbs-${NOALBS_VERSION}-x86_64-unknown-linux-musl/* /app/ && \
    rm -rf /tmp/noalbs* && \
    chmod +x /app/noalbs

COPY files/noalbs.sh /app/noalbs.sh
COPY files/.env /app/.env
COPY files/config.json /app/config.json
COPY files/orginial-config.bak /app/orginial-config.bak

EXPOSE 5000/udp 8181/tcp 8282/udp

CMD ["/usr/bin/supervisord"]
