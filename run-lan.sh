#!/usr/bin/env bash
# Start LoRA Studio reachable from other devices on the local network (access code required).
cd "$(dirname "$0")"
HOST=0.0.0.0 exec ./run.sh
