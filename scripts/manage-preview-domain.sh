#!/usr/bin/env bash

set -euo pipefail

if [[ ! "$BRANCH_NAME" =~ ^(build|chore|ci|docs|feat|feature|fix|perf|refactor|revert|sandbox|style|test)/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$ ]]; then
  echo "The branch has no managed Preview domain."
  exit 0
fi

prefix="${BASH_REMATCH[1]}"
branch_label="${BASH_REMATCH[2]}"

if [[ "$prefix" == "sandbox" ]]; then
  case "$branch_label" in
    admin|api|app|assets|auth|blog|cdn|customermates|demo|dev|development|docs|help|internal|login|mail|main|mcp|preview|prod|production|security|staging|static|status|support|test|www)
      echo "The sandbox name is reserved."
      exit 0
      ;;
  esac
  if [[ "$branch_label" =~ ^(build|chore|ci|docs|feat|feature|fix|perf|refactor|revert|sandbox|style|test)- ]]; then
    echo "The sandbox name collides with an engineering branch."
    exit 0
  fi
  domain_label="$branch_label"
else
  domain_label="${prefix}-${branch_label}"
fi

if [[ ! "$domain_label" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "The generated Preview-domain label is too long."
  exit 0
fi

hostname="${domain_label}.${PREVIEW_DOMAIN}"
domain_url="https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${hostname}?teamId=${VERCEL_TEAM_ID}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-preview-domain.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

headers=(
  --header "Authorization: Bearer ${VERCEL_TOKEN}"
  --header "Content-Type: application/json"
)

domain_status="$(curl --silent --show-error --max-time 20 --retry 3 \
  "${headers[@]}" \
  --output "$temporary_directory/domain.json" \
  --write-out '%{http_code}' \
  "$domain_url")"

domain_matches_branch() {
  jq -e --arg name "$hostname" --arg project "$VERCEL_PROJECT_ID" --arg branch "$BRANCH_NAME" \
    '.name == $name and .projectId == $project and .gitBranch == $branch' \
    "$temporary_directory/domain.json" >/dev/null
}

case "$EVENT_ACTION" in
  create)
    if [[ "$domain_status" == "200" ]]; then
      if ! domain_matches_branch; then
        echo "$hostname is already assigned to another branch." >&2
        exit 1
      fi
      echo "$hostname already follows $BRANCH_NAME."
      exit 0
    fi
    if [[ "$domain_status" != "404" ]]; then
      echo "Vercel returned HTTP $domain_status while reading $hostname." >&2
      exit 1
    fi

    jq -cn --arg name "$hostname" --arg branch "$BRANCH_NAME" '{name: $name, gitBranch: $branch}' \
      > "$temporary_directory/create-domain.json"
    create_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --request POST \
      "${headers[@]}" \
      --data-binary "@$temporary_directory/create-domain.json" \
      --output "$temporary_directory/create-response.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}")"
    if [[ "$create_status" != "200" ]]; then
      echo "Vercel returned HTTP $create_status while creating $hostname." >&2
      exit 1
    fi
    echo "$hostname now follows $BRANCH_NAME."
    ;;
  delete)
    if [[ "$domain_status" == "404" ]]; then
      echo "$hostname is already absent."
      exit 0
    fi
    if [[ "$domain_status" != "200" ]] || ! domain_matches_branch; then
      echo "$hostname is not assigned to $BRANCH_NAME." >&2
      exit 1
    fi

    delete_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --request DELETE \
      "${headers[@]}" \
      --output "$temporary_directory/delete-response.json" \
      --write-out '%{http_code}' \
      "$domain_url")"
    if [[ "$delete_status" != "200" && "$delete_status" != "404" ]]; then
      echo "Vercel returned HTTP $delete_status while removing $hostname." >&2
      exit 1
    fi
    echo "Removed $hostname."
    ;;
  *)
    echo "Unsupported event: $EVENT_ACTION" >&2
    exit 1
    ;;
esac
