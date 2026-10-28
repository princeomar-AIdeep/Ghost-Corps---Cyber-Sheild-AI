#!/bin/sh
set -eu
cp -R /project-input/. /workspace/
cd "/workspace/${TERMINAL_WORKDIR:-.}"
exec "$@"