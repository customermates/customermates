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

# Squid's access_log writes to a real file (see squid.conf) because writing to
# stdout directly, as the dropped-privilege `proxy` user, doesn't work in this
# container (confirmed: both the stdio and daemon log modules targeting
# /dev/stdout fail). Tail that file to OUR stdout instead, backgrounded so the
# `exec` below can still hand off signal/PID-1 duties to squid itself — the
# tail keeps running as an independent process, unaffected by its parent shell
# image being replaced.
: > /var/log/squid/access.log
# Created by root (entrypoint.sh hasn't dropped privileges); squid itself later
# writes to it as the unprivileged `proxy` user (cache_effective_user), so it
# needs to actually own the file, not just have its directory be proxy-owned.
chown proxy:proxy /var/log/squid/access.log
tail -F /var/log/squid/access.log &

# Foreground; no daemon.
exec squid -N -f /etc/squid/squid.conf
