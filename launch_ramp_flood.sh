#!/bin/bash
set -euo pipefail

# Backward-compatible alias for older launch command names.
# Delegates to wait-until-ready launcher for safer starts.
exec bash tests/qbtc_self_heal/launch_when_ready.sh "$@"
