#!/usr/bin/env bash

# Rebuilds the deployment behind the demo domain. Its build resets the demo database and seeds it again
# (scripts/vercel-build.sh), so the demo's dated records start from the current week every day, not only after a
# push to main. Vercel runs vercel.json crons for Production deployments only, so the schedule lives in GitHub
# Actions (.github/workflows/demo-reseed.yml).

set -euo pipefail

: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID must be configured}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID must be configured}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN must be configured}"

demo_host="${DEMO_HOST:-demo.customermates.com}"
demo_environment="${DEMO_ENVIRONMENT:-demo}"

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-demo-redeploy.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

encoded_host="$(jq -rn --arg value "$demo_host" '$value | @uri')"
encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"

current_status="$(curl --silent --show-error --max-time 20 --retry 3 \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --output "$temporary_directory/current.json" \
  --write-out '%{http_code}' \
  "https://api.vercel.com/v13/deployments/${encoded_host}?teamId=${encoded_team}")"
if [[ "$current_status" != "200" ]]; then
  echo "Vercel returned HTTP $current_status while reading the deployment behind $demo_host." >&2
  exit 1
fi

if ! jq -e --arg project "$VERCEL_PROJECT_ID" '.project.id == $project and .readyState == "READY"' \
  "$temporary_directory/current.json" >/dev/null; then
  echo "The deployment behind $demo_host is not a ready deployment of this project; nothing was redeployed." >&2
  exit 1
fi

deployment_id="$(jq -r '.id' "$temporary_directory/current.json")"
project_name="$(jq -r '.name' "$temporary_directory/current.json")"

jq -cn \
  --arg name "$project_name" \
  --arg project "$VERCEL_PROJECT_ID" \
  --arg deployment "$deployment_id" \
  --arg environment "$demo_environment" \
  '{name: $name, project: $project, deploymentId: $deployment, customEnvironmentSlugOrId: $environment, meta: {action: "redeploy", trigger: "demo-reseed"}}' \
  >"$temporary_directory/request.json"

redeploy_status="$(curl --silent --show-error --max-time 60 \
  --request POST \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --header "Content-Type: application/json" \
  --data @"$temporary_directory/request.json" \
  --output "$temporary_directory/redeploy.json" \
  --write-out '%{http_code}' \
  "https://api.vercel.com/v13/deployments?teamId=${encoded_team}&forceNew=1")"
if [[ "$redeploy_status" != "200" ]]; then
  echo "Vercel returned HTTP $redeploy_status while redeploying $deployment_id." >&2
  jq -r '.error.message // empty' "$temporary_directory/redeploy.json" >&2 || true
  exit 1
fi

echo "Redeploying $deployment_id for $demo_host as $(jq -r '.id' "$temporary_directory/redeploy.json")."
