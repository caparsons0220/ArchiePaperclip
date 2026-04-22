#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

# Bootstrap and manual admin setup can create root-owned instance paths inside
# the persisted volume. Repair them before dropping privileges so agent runs can
# write logs and other runtime state after restarts.
needs_repair=0
for path in \
    /paperclip \
    /paperclip/instances \
    /paperclip/instances/default \
    /paperclip/instances/default/data \
    /paperclip/instances/default/secrets
do
    if [ -e "$path" ] && ! gosu node test -w "$path"; then
        needs_repair=1
        break
    fi
done

if [ "$changed" = "1" ] || [ "$needs_repair" = "1" ]; then
    chown -R node:node /paperclip
fi

if [ -n "${OPENAI_API_KEY:-}" ] && command -v codex >/dev/null 2>&1; then
    mkdir -p /paperclip/.codex
    chown -R node:node /paperclip/.codex
    if gosu node sh -lc 'mkdir -p "$HOME/.codex" && printf "%s" "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1'; then
        echo "Initialized Codex API auth in /paperclip/.codex"
    else
        echo "Warning: failed to initialize Codex API auth from OPENAI_API_KEY" >&2
    fi
fi

exec gosu node "$@"
