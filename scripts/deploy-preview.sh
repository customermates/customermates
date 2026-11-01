#!/usr/bin/env bash

# Starts a Vercel preview build of one branch (.github/workflows/preview-deploy.yml). Git pushes build previews only
# for SEO daily branches and pull requests with the `preview` label (scripts/vercel-ignore-build.mjs); this covers a
# label added after the last push and a manual run.

set -euo pipefail

: "${BRANCH:?BRANCH must name the branch to build}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID must be configured}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID must be configured}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN must be configured}"

if [[ ! "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ || "$BRANCH" == "main" ]]; then
  echo "BRANCH must be a non-main branch name." >&2
  exit 1
fi
if [[ -n "${COMMIT_SHA:-}" && ! "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "COMMIT_SHA must be a full commit SHA." >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-preview-deploy.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"

jq -cn \
  --arg project "$VERCEL_PROJECT_ID" \
  --arg ref "$BRANCH" \
  --arg sha "${COMMIT_SHA:-}" \
  '{name: "customermates", project: $project,
    gitSource: ({type: "github", org: "customermates", repo: "customermates", ref: $ref} + (if $sha == "" then {} else {sha: $sha} end)),
    meta: {action: "preview", trigger: "preview-deploy"}}' \
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
  echo "Vercel returned HTTP $status while starting the preview of $BRANCH." >&2
  jq -r '.error.message // empty' "$temporary_directory/deployment.json" >&2 || true
  exit 1
fi

echo "Building the preview of $BRANCH as $(jq -r '.id' "$temporary_directory/deployment.json") ($(jq -r '.url' "$temporary_directory/deployment.json"))."
