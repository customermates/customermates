#!/usr/bin/env bash

# Runs a production build inside a memory- and CPU-limited systemd scope and prints its wall time, peak memory and
# whether the kernel killed it, to check that the build fits a Vercel build machine (Standard: 4 cores, 8 GB; Enhanced:
# 8 cores, 16 GB). Run it on a machine with spare memory, for example ws-test:
#
#   workspace offload customermates -- bash scripts/measure-build-memory.sh --cores 4 --memory 8G
#
# By default it builds like Vercel does (VERCEL=1 skips the type check, scripts/vercel-build.sh's heap) from a clean
# .next. The peak counts the scope's page cache as well, so it overstates what the build strictly needs; a run that
# finishes under the cap without an OOM kill is the actual proof. Pass a command after -- to measure something else.
# The build reads the checkout's .env, as any local build does.

set -euo pipefail

cores=4
memory=8G
keep_cache=false
while (($#)); do
  case "$1" in
    --cores) cores="$2"; shift 2 ;;
    --memory) memory="$2"; shift 2 ;;
    --keep-cache) keep_cache=true; shift ;;
    --) shift; break ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
done
(($#)) || set -- env VERCEL=1 NEXT_BUILD_HEAP_MB=4096 yarn build

available="$(nproc)"
if ((cores > available)); then
  echo "This machine has only $available cores." >&2
  exit 2
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [[ "$keep_cache" == true ]]; then rm -rf .next/server .next/static; else rm -rf .next; fi

report="$(mktemp "${TMPDIR:-/tmp}/customermates-build-memory.XXXXXX")"
trap 'rm -f "$report"' EXIT

start=$(date +%s)
set +e
systemd-run --user --scope --quiet --collect \
  -p MemoryMax="$memory" -p MemorySwapMax=0 -p CPUQuota="$((cores * 100))%" \
  taskset -c "0-$((cores - 1))" \
  bash -c 'group=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup); "$@"; status=$?
    printf "%s %s\n" "$(cat "$group/memory.peak")" "$(awk "/^oom_kill / {print \$2}" "$group/memory.events")" >"'"$report"'"
    exit $status' _ "$@"
status=$?
set -e
seconds=$(($(date +%s) - start))

if [[ -s "$report" ]]; then
  read -r peak kills <"$report"
  printf 'exit %s, %s s, peak %.2f GiB, OOM kills %s (cap %s, %s cores)\n' \
    "$status" "$seconds" "$(awk -v bytes="$peak" 'BEGIN {print bytes / 1073741824}')" "$kills" "$memory" "$cores"
else
  printf 'exit %s, %s s, killed before it finished (cap %s, %s cores)\n' "$status" "$seconds" "$memory" "$cores"
fi
exit "$status"
