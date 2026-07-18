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
encoded_branch="$(jq -rn --arg value "$BRANCH_NAME" '$value | @uri')"
encoded_hostname="$(jq -rn --arg value "$hostname" '$value | @uri')"
encoded_project="$(jq -rn --arg value "$VERCEL_PROJECT_ID" '$value | @uri')"
encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"
domain_url="https://api.vercel.com/v9/projects/${encoded_project}/domains/${encoded_hostname}?teamId=${encoded_team}"
alias_url="https://api.vercel.com/v4/aliases/${encoded_hostname}?projectId=${encoded_project}&teamId=${encoded_team}"
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
    deployment_query="projectId=${encoded_project}&teamId=${encoded_team}&state=READY&branch=${encoded_branch}&limit=1"
    if [[ -n "${STATUS_SHA:-}" ]]; then
      encoded_sha="$(jq -rn --arg value "$STATUS_SHA" '$value | @uri')"
      deployment_query="${deployment_query}&sha=${encoded_sha}"
    fi
    deployment_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      "${headers[@]}" \
      --output "$temporary_directory/deployments.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v7/deployments?${deployment_query}")"
    if [[ "$deployment_status" != "200" ]]; then
      echo "Vercel returned HTTP $deployment_status while finding the Preview deployment." >&2
      exit 1
    fi
    deployment_id="$(jq -r '.deployments[0].uid // empty' "$temporary_directory/deployments.json")"
    if [[ -z "$deployment_id" ]]; then
      echo "Vercel has no ready deployment for $BRANCH_NAME${STATUS_SHA:+ at $STATUS_SHA}." >&2
      exit 1
    fi
    deployment_target="$(jq -r '.deployments[0].target // empty' "$temporary_directory/deployments.json")"
    if [[ -n "$deployment_target" ]]; then
      echo "Refusing to point a Preview domain at the targeted $deployment_target deployment." >&2
      exit 1
    fi

    if [[ "$domain_status" == "200" ]]; then
      if ! domain_matches_branch; then
        echo "$hostname is already assigned to another branch." >&2
        exit 1
      fi
    elif [[ "$domain_status" == "404" ]]; then
      jq -cn --arg name "$hostname" --arg branch "$BRANCH_NAME" '{name: $name, gitBranch: $branch}' \
        > "$temporary_directory/create-domain.json"
      create_status="$(curl --silent --show-error --max-time 20 --retry 3 \
        --request POST \
        "${headers[@]}" \
        --data-binary "@$temporary_directory/create-domain.json" \
        --output "$temporary_directory/create-response.json" \
        --write-out '%{http_code}' \
        "https://api.vercel.com/v10/projects/${encoded_project}/domains?teamId=${encoded_team}")"
      if [[ "$create_status" != "200" ]]; then
        echo "Vercel returned HTTP $create_status while creating $hostname." >&2
        exit 1
      fi
    else
      echo "Vercel returned HTTP $domain_status while reading $hostname." >&2
      exit 1
    fi

    alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      "${headers[@]}" \
      --output "$temporary_directory/alias.json" \
      --write-out '%{http_code}' \
      "$alias_url")"
    if [[ "$alias_status" == "200" ]] && \
      jq -e --arg alias "$hostname" --arg project "$VERCEL_PROJECT_ID" --arg deployment "$deployment_id" \
        '.alias == $alias and .projectId == $project and .deploymentId == $deployment' \
        "$temporary_directory/alias.json" >/dev/null; then
      echo "$hostname already points to $deployment_id and follows $BRANCH_NAME."
      exit 0
    fi
    if [[ "$alias_status" != "200" && "$alias_status" != "404" ]]; then
      echo "Vercel returned HTTP $alias_status while reading the alias for $hostname." >&2
      exit 1
    fi
    if [[ "$alias_status" == "200" ]] && \
      ! jq -e --arg project "$VERCEL_PROJECT_ID" '.projectId == $project' "$temporary_directory/alias.json" >/dev/null; then
      echo "$hostname is already an alias of another project." >&2
      exit 1
    fi

    jq -cn --arg alias "$hostname" '{alias: $alias}' > "$temporary_directory/assign-alias.json"
    assign_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --request POST \
      "${headers[@]}" \
      --data-binary "@$temporary_directory/assign-alias.json" \
      --output "$temporary_directory/assign-response.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v2/deployments/${deployment_id}/aliases?teamId=${encoded_team}")"
    if [[ "$assign_status" != "200" ]]; then
      echo "Vercel returned HTTP $assign_status while pointing $hostname to $deployment_id." >&2
      exit 1
    fi
    echo "$hostname now points to $deployment_id and follows $BRANCH_NAME."
    ;;
  delete)
    if [[ "$domain_status" != "200" && "$domain_status" != "404" ]]; then
      echo "Vercel returned HTTP $domain_status while reading $hostname." >&2
      exit 1
    fi
    if [[ "$domain_status" == "200" ]] && ! domain_matches_branch; then
      echo "$hostname is not assigned to $BRANCH_NAME." >&2
      exit 1
    fi

    alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      "${headers[@]}" \
      --output "$temporary_directory/alias.json" \
      --write-out '%{http_code}' \
      "$alias_url")"
    if [[ "$alias_status" != "200" && "$alias_status" != "404" ]]; then
      echo "Vercel returned HTTP $alias_status while reading the alias for $hostname." >&2
      exit 1
    fi
    if [[ "$alias_status" == "200" ]]; then
      if ! jq -e --arg project "$VERCEL_PROJECT_ID" '.projectId == $project' \
        "$temporary_directory/alias.json" >/dev/null; then
        echo "$hostname is an alias of another project." >&2
        exit 1
      fi
      alias_id="$(jq -r '.uid // empty' "$temporary_directory/alias.json")"
      if [[ -z "$alias_id" ]]; then
        echo "Vercel returned an alias without an ID for $hostname." >&2
        exit 1
      fi
      encoded_alias_id="$(jq -rn --arg value "$alias_id" '$value | @uri')"
      delete_alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
        --request DELETE \
        "${headers[@]}" \
        --output "$temporary_directory/delete-alias-response.json" \
        --write-out '%{http_code}' \
        "https://api.vercel.com/v2/aliases/${encoded_alias_id}?teamId=${encoded_team}")"
      if [[ "$delete_alias_status" != "200" && "$delete_alias_status" != "404" ]]; then
        echo "Vercel returned HTTP $delete_alias_status while removing the alias for $hostname." >&2
        exit 1
      fi
    fi

    if [[ "$domain_status" == "200" ]]; then
      delete_domain_status="$(curl --silent --show-error --max-time 20 --retry 3 \
        --request DELETE \
        "${headers[@]}" \
        --output "$temporary_directory/delete-domain-response.json" \
        --write-out '%{http_code}' \
        "$domain_url")"
      if [[ "$delete_domain_status" != "200" && "$delete_domain_status" != "404" ]]; then
        echo "Vercel returned HTTP $delete_domain_status while removing $hostname." >&2
        exit 1
      fi
    fi
    echo "Removed $hostname."
    ;;
  *)
    echo "Unsupported event: $EVENT_ACTION" >&2
    exit 1
    ;;
esac
