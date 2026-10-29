#!/bin/sh
# Writes /tmp/config.js from env vars when the container starts: the public settings that differ
# per environment, so the same image serves staging and production. nginx serves it at /config.js
# (see nginx.conf). The nginx image runs every script in /docker-entrypoint.d/ before nginx starts,
# and a failure here stops the container, so a site with broken sign-in never goes up.
# /tmp, not the site folder: the container's file system is read-only apart from /tmp.
set -eu

# Both values are public identifiers made only of these characters. Anything else is a mistake,
# and would otherwise end up inside a script the browser runs.
check() {
  case "$2" in
    "" | *[!A-Za-z0-9._-]*)
      echo "config.sh: $1 is missing or has unexpected characters" >&2
      exit 1
      ;;
  esac
}

check GOOGLE_CLIENT_ID "${GOOGLE_CLIENT_ID:-}"
check TURNSTILE_SITE_KEY "${TURNSTILE_SITE_KEY:-}"

printf 'window.__OPENUVOICE_CONFIG__ = { googleClientId: "%s", turnstileSiteKey: "%s" };\n' \
  "$GOOGLE_CLIENT_ID" "$TURNSTILE_SITE_KEY" > /tmp/config.js