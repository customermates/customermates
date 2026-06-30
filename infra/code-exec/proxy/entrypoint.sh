#!/bin/sh
set -eu

# Build the CONNECT allowlist from $ALLOWLIST (comma-separated hosts). Each host is
# written with a leading dot so subdomains match (".pypi.org" matches pypi.org and
# files.pypi.org). If ALLOWLIST is empty, the file stays empty => deny all (fail closed).
: > /etc/squid/allowlist.txt
OLD_IFS=$IFS
IFS=','
for host in ${ALLOWLIST:-}; do
  host=$(printf '%s' "$host" | tr -d '[:space:]')
  [ -n "$host" ] && printf '.%s\n' "$host" >> /etc/squid/allowlist.txt
done
IFS=$OLD_IFS

echo "egress-proxy allowlist:" && cat /etc/squid/allowlist.txt

# Foreground; no daemon.
exec squid -N -f /etc/squid/squid.conf
