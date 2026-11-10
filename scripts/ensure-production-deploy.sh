#!/usr/bin/env bash

# Makes sure a push to main reaches production (.github/workflows/production-deploy-check.yml). Vercel's Git
# integration normally starts the production build within seconds; on 2026-11-10 it never received the push of
# #299, so production kept the previous commit. This waits up to WAIT_SECONDS for any production deployment of
# COMMIT_SHA and, only when none exists, starts one for that exact commit.

set -euo pipefail

: "${COMMIT_SHA:?COMMIT_SHA must name the pushed main commit}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID must be configured}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID must be configured}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN must be configured}"

WAIT_SECONDS="${WAIT_SECONDS:-600}"
POLL_SECONDS="${POLL_SECONDS:-30}"

if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "COMMIT_SHA must be a full commit SHA." >&2
  exit 1
fi
if [[ ! "$WAIT_SECONDS" =~ ^[0-9]+$ || ! "$POLL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "WAIT_SECONDS and POLL_SECONDS must be whole seconds." >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-production-deploy.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"
encoded_project="$(jq -rn --arg value "$VERCEL_PROJECT_ID" '$value | @uri')"

existing_deployment() {
  local status
  status="$(curl --silent --show-error --max-time 60 \
    --request GET \
    --header "Authorization: Bearer ${VERCEL_TOKEN}" \
    --output "$temporary_directory/deployments.json" \
    --write-out '%{http_code}' \
    "https://api.vercel.com/v6/deployments?teamId=${encoded_team}&projectId=${encoded_project}&target=production&sha=${COMMIT_SHA}&limit=5")"
  if [[ "$status" != "200" ]]; then
    echo "Vercel returned HTTP $status while listing production deployments of $COMMIT_SHA." >&2
    return 2
  fi
  jq -r --arg sha "$COMMIT_SHA" \
    '[.deployments[] | select(.meta.githubCommitSha == $sha)] | first | if . == null then "" else "\(.uid) \(.state)" end' \
    "$temporary_directory/deployments.json"
}

deadline=$((SECONDS + WAIT_SECONDS))
while true; do
  found="$(existing_deployment)"
  if [[ -n "$found" ]]; then
    echo "Production deployment of $COMMIT_SHA exists: $found."
    exit 0
  fi
  if ((SECONDS >= deadline)); then break; fi
  sleep "$POLL_SECONDS"
done

echo "No production deployment of $COMMIT_SHA after ${WAIT_SECONDS}s; starting one."

jq -cn \
  --arg project "$VERCEL_PROJECT_ID" \
  --arg sha "$COMMIT_SHA" \
  '{name: "customermates", project: $project, target: "production",
    gitSource: {type: "github", org: "customermates", repo: "customermates", ref: "main", sha: $sha},
    meta: {action: "production", trigger: "production-deploy-check"}}' \
  >"$temporary_directory/request.json"

status="$(curl --silent --show-error --max-time 60 \
  --request POST \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --header "Content-Type: application/json" \
  --data @"$temporary_directory/request.json" \
  --output "$temporary_directory/deployment.json" \
  --write-out '%{http_code}' \
  "https://api.vercel.com/v13/deployments?teamId=${encoded_team}")"
if [[ "$status" != "200" ]]; then
  echo "Vercel returned HTTP $status while starting the production build of $COMMIT_SHA." >&2
  jq -r '.error.message // empty' "$temporary_directory/deployment.json" >&2 || true
  exit 1
fi

echo "::warning::Vercel did not deploy $COMMIT_SHA on its own; started $(jq -r '.id' "$temporary_directory/deployment.json") ($(jq -r '.url' "$temporary_directory/deployment.json"))."
