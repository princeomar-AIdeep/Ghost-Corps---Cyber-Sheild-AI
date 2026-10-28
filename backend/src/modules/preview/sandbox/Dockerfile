FROM node:22-alpine

RUN npm install --prefix /opt/preview --no-save --ignore-scripts --no-audit --no-fund \
    vite@6.4.1 react@18.3.1 react-dom@18.3.1 @vitejs/plugin-react@4.3.4 lucide-react@0.468.0
COPY --chmod=0555 entrypoint.sh /usr/local/bin/preview-entrypoint
ENV PATH=/opt/preview/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
    NODE_PATH=/opt/preview/node_modules \
    HOME=/tmp \
    npm_config_cache=/tmp/npm-cache
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/preview-entrypoint"]
USER node
