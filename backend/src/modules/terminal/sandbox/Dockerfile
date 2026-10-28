FROM node:22-alpine

COPY --chmod=0555 entrypoint.sh /usr/local/bin/worker-entrypoint
WORKDIR /workspace
ENV HOME=/tmp \
    npm_config_cache=/tmp/npm-cache \
    CI=1
ENTRYPOINT ["/usr/local/bin/worker-entrypoint"]
USER node
