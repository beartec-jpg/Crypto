#!/bin/bash
set -euo pipefail

# Backward-compatible entrypoint.
# Delegates to wait-until-ready launcher for safer starts.
exec bash tests/qbtc_self_heal/launch_when_ready.sh "$@"
