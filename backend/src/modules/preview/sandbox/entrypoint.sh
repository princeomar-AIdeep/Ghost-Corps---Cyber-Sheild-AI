#!/bin/sh
set -eu
cp -a /project-input/. /workspace/
mkdir -p /workspace/node_modules
for package in vite react react-dom lucide-react @vitejs/plugin-react; do
  mkdir -p "/workspace/node_modules/$(dirname "$package")"
  ln -sfn "/opt/preview/node_modules/$package" "/workspace/node_modules/$package"
done
exec "$@"
