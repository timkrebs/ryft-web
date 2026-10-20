# syntax=docker/dockerfile:1
# ryftapp.de: build the static export with Node, serve it with unprivileged nginx.
# Fonts (Fontshare) and the app's licence texts (GitHub, pinned revisions) are fetched
# during the build; nothing else leaves the build, and the final image has no Node.

FROM node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into the HTML; both may stay empty (the pages then hide or mark what's missing).
ARG NEXT_PUBLIC_TESTFLIGHT_URL=""
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_TESTFLIGHT_URL=${NEXT_PUBLIC_TESTFLIGHT_URL} \
    NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL}
RUN npm run build && node scripts/precompress.mjs

FROM nginxinc/nginx-unprivileged:1.31.6-alpine3.24@sha256:884e0b7f42f303641b0f4e78755aea647521dca0b89ca3be7992ad78b5c07434
USER root
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/snippets
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/headers.conf /etc/nginx/snippets/headers.conf
COPY --from=build /web/nginx/csp.conf /etc/nginx/snippets/csp.conf
COPY --from=build /web/out /usr/share/nginx/html
# Runs as nginx (101). Read-only root filesystem: mount writable /tmp and /var/cache/nginx.
USER 101
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/timkrebs/ryft-web" \
      org.opencontainers.image.description="ryftapp.de, static, served by nginx" \
      org.opencontainers.image.licenses="NOASSERTION"
