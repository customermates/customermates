#!/usr/bin/env bash

set -euo pipefail

: "${EVENT_ACTION:?EVENT_ACTION must be deploy or delete}"

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/customermates-preview-domain.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT

case "$EVENT_ACTION" in
  deploy)
    : "${DEPLOYMENT_URL:?DEPLOYMENT_URL must identify a completed Vercel Preview deployment}"
    : "${GITHUB_TOKEN:?GITHUB_TOKEN must be configured}"
    : "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID must be configured}"
    : "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID must be configured}"
    : "${VERCEL_TOKEN:?VERCEL_TOKEN must be configured}"

    if [[ ! "$DEPLOYMENT_URL" =~ ^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?\.vercel\.app/?$ ]]; then
      echo "DEPLOYMENT_URL must be an HTTPS vercel.app deployment URL." >&2
      exit 1
    fi

    deployment_host="${DEPLOYMENT_URL#https://}"
    deployment_host="${deployment_host%/}"
    encoded_deployment="$(jq -rn --arg value "$deployment_host" '$value | @uri')"
    encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"
    deployment_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" \
      --output "$temporary_directory/deployment.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v13/deployments/${encoded_deployment}?teamId=${encoded_team}")"
    if [[ "$deployment_status" != "200" ]]; then
      echo "Vercel returned HTTP $deployment_status while reading $deployment_host." >&2
      exit 1
    fi

    if ! jq -e --arg project "$VERCEL_PROJECT_ID" \
      '.project.id == $project and .readyState == "READY" and
       .meta.githubCommitOrg == "customermates" and .meta.githubCommitRepo == "customermates" and
       (.meta.githubCommitRef | type == "string") and (.meta.githubCommitSha | test("^[0-9a-f]{40}$"))' \
      "$temporary_directory/deployment.json" >/dev/null; then
      echo "The deployment is not a ready Customermates deployment from the configured project." >&2
      exit 1
    fi

    if jq -e '.target != null' "$temporary_directory/deployment.json" >/dev/null; then
      echo "Production deployments have no managed Preview domain."
      exit 0
    fi

    BRANCH_NAME="$(jq -er '.meta.githubCommitRef' "$temporary_directory/deployment.json")"
    deployment_id="$(jq -er '.id' "$temporary_directory/deployment.json")"
    deployment_sha="$(jq -er '.meta.githubCommitSha' "$temporary_directory/deployment.json")"
    if [[ -n "${DEPLOYMENT_SHA:-}" && "$DEPLOYMENT_SHA" != "$deployment_sha" ]]; then
      echo "The GitHub deployment report does not match the Vercel deployment." >&2
      exit 1
    fi

    encoded_branch="$(jq -rn --arg value "$BRANCH_NAME" '$value | @uri')"
    branch_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --header "Authorization: Bearer ${GITHUB_TOKEN}" \
      --header "Accept: application/vnd.github+json" \
      --output "$temporary_directory/branch.json" \
      --write-out '%{http_code}' \
      "https://api.github.com/repos/customermates/customermates/git/ref/heads/${encoded_branch}")"
    if [[ "$branch_status" == "404" ]]; then
      echo "$BRANCH_NAME no longer exists; skipping its completed deployment."
      exit 0
    fi
    if [[ "$branch_status" != "200" ]]; then
      echo "GitHub returned HTTP $branch_status while reading $BRANCH_NAME." >&2
      exit 1
    fi
    if ! jq -e --arg sha "$deployment_sha" '.object.type == "commit" and .object.sha == $sha' \
      "$temporary_directory/branch.json" >/dev/null; then
      echo "$deployment_host is not the latest commit on $BRANCH_NAME; keeping the newer branch domain."
      exit 0
    fi
    ;;
  delete)
    : "${BRANCH_NAME:?BRANCH_NAME must identify the deleted branch}"
    ;;
  *)
    echo "EVENT_ACTION must be deploy or delete." >&2
    exit 1
    ;;
esac

if [[ ! "$BRANCH_NAME" =~ ^(build|chore|ci|docs|feat|fix|perf|refactor|revert|sandbox|style|test)/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$ ]]; then
  echo "The branch has no managed Preview domain."
  exit 0
fi

prefix="${BASH_REMATCH[1]}"
branch_label="${BASH_REMATCH[2]}"

if [[ "$prefix" == "sandbox" ]]; then
  domain_label="$branch_label"
else
  domain_label="${prefix}-${branch_label}"
fi

if [[ ! "$domain_label" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "The generated Preview-domain label is too long."
  exit 0
fi

: "${PREVIEW_DOMAIN:?PREVIEW_DOMAIN must be configured}"

if [[ ${#PREVIEW_DOMAIN} -gt 253 || ".$PREVIEW_DOMAIN." == *".xn--"* || ! "$PREVIEW_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
  echo "PREVIEW_DOMAIN must be a lowercase DNS hostname without a wildcard or trailing dot." >&2
  exit 1
fi

hostname="${domain_label}.${PREVIEW_DOMAIN}"
if [[ ${#hostname} -gt 253 ]]; then
  echo "The generated Preview domain is too long." >&2
  exit 1
fi

: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID must be configured}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID must be configured}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN must be configured}"

if [[ "$EVENT_ACTION" == "delete" ]]; then
  : "${GITHUB_TOKEN:?GITHUB_TOKEN must be configured}"
  encoded_branch="$(jq -rn --arg value "$BRANCH_NAME" '$value | @uri')"
  branch_status="$(curl --silent --show-error --max-time 20 --retry 3 \
    --header "Authorization: Bearer ${GITHUB_TOKEN}" \
    --header "Accept: application/vnd.github+json" \
    --output "$temporary_directory/branch.json" \
    --write-out '%{http_code}' \
    "https://api.github.com/repos/customermates/customermates/git/ref/heads/${encoded_branch}")"
  if [[ "$branch_status" == "200" ]]; then
    echo "$BRANCH_NAME exists again; skipping its stale deletion event."
    exit 0
  fi
  if [[ "$branch_status" != "404" ]]; then
    echo "GitHub returned HTTP $branch_status while checking the deleted branch $BRANCH_NAME." >&2
    exit 1
  fi
fi

encoded_hostname="$(jq -rn --arg value "$hostname" '$value | @uri')"
encoded_project="$(jq -rn --arg value "$VERCEL_PROJECT_ID" '$value | @uri')"
encoded_team="$(jq -rn --arg value "$VERCEL_TEAM_ID" '$value | @uri')"
domain_url="https://api.vercel.com/v9/projects/${encoded_project}/domains/${encoded_hostname}?teamId=${encoded_team}"

domain_status="$(curl --silent --show-error --max-time 20 --retry 3 \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --output "$temporary_directory/domain.json" \
  --write-out '%{http_code}' \
  "$domain_url")"

case "$EVENT_ACTION" in
  deploy)
    if [[ "$domain_status" == "200" ]]; then
      if ! jq -e --arg name "$hostname" --arg project "$VERCEL_PROJECT_ID" --arg branch "$BRANCH_NAME" \
        '.name == $name and .projectId == $project and .gitBranch == $branch and .verified == true' \
        "$temporary_directory/domain.json" >/dev/null; then
        echo "$hostname is already assigned to another branch, project, or unverified domain." >&2
        exit 1
      fi
    elif [[ "$domain_status" == "404" ]]; then
      jq -cn --arg name "$hostname" --arg branch "$BRANCH_NAME" '{name: $name, gitBranch: $branch}' \
        > "$temporary_directory/create-domain.json"
      create_status="$(curl --silent --show-error --max-time 20 --retry 3 \
        --request POST \
        --header "Authorization: Bearer ${VERCEL_TOKEN}" \
        --header "Content-Type: application/json" \
        --data-binary "@$temporary_directory/create-domain.json" \
        --output "$temporary_directory/create-response.json" \
        --write-out '%{http_code}' \
        "https://api.vercel.com/v10/projects/${encoded_project}/domains?teamId=${encoded_team}")"
      if [[ "$create_status" != "200" ]] || ! jq -e \
        --arg name "$hostname" --arg project "$VERCEL_PROJECT_ID" --arg branch "$BRANCH_NAME" \
        '.name == $name and .projectId == $project and .gitBranch == $branch and .verified == true' \
        "$temporary_directory/create-response.json" >/dev/null; then
        echo "Vercel did not create the expected verified branch domain (HTTP $create_status)." >&2
        exit 1
      fi
    else
      echo "Vercel returned HTTP $domain_status while reading $hostname." >&2
      exit 1
    fi

    alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" \
      --output "$temporary_directory/alias.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v4/aliases/${encoded_hostname}?teamId=${encoded_team}")"
    if [[ "$alias_status" == "200" ]] && jq -e --arg deployment "$deployment_id" --arg project "$VERCEL_PROJECT_ID" \
      '.deploymentId == $deployment and .projectId == $project' "$temporary_directory/alias.json" >/dev/null; then
      echo "$hostname already serves the latest deployment for $BRANCH_NAME."
      exit 0
    fi
    if [[ "$alias_status" != "200" && "$alias_status" != "404" ]]; then
      echo "Vercel returned HTTP $alias_status while reading the alias for $hostname." >&2
      exit 1
    fi
    if [[ "$alias_status" == "200" ]] && ! jq -e --arg project "$VERCEL_PROJECT_ID" '.projectId == $project' \
      "$temporary_directory/alias.json" >/dev/null; then
      echo "$hostname is currently aliased outside the configured project." >&2
      exit 1
    fi

    jq -cn --arg alias "$hostname" '{alias: $alias}' > "$temporary_directory/assign-alias.json"
    assign_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --request POST \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" \
      --header "Content-Type: application/json" \
      --data-binary "@$temporary_directory/assign-alias.json" \
      --output "$temporary_directory/assign-response.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v2/deployments/${deployment_id}/aliases?teamId=${encoded_team}")"
    if [[ "$assign_status" != "200" ]] || ! jq -e --arg alias "$hostname" '.alias == $alias' \
      "$temporary_directory/assign-response.json" >/dev/null; then
      echo "Vercel did not assign $hostname to the ready deployment (HTTP $assign_status)." >&2
      exit 1
    fi
    echo "$hostname now serves the latest deployment for $BRANCH_NAME."
    ;;
  delete)
    if [[ "$domain_status" == "404" ]]; then
      echo "$hostname is already removed."
      exit 0
    fi
    if [[ "$domain_status" != "200" ]]; then
      echo "Vercel returned HTTP $domain_status while reading $hostname." >&2
      exit 1
    fi
    if ! jq -e --arg name "$hostname" --arg project "$VERCEL_PROJECT_ID" --arg branch "$BRANCH_NAME" \
      '.name == $name and .projectId == $project and .gitBranch == $branch' \
      "$temporary_directory/domain.json" >/dev/null; then
      echo "$hostname is not assigned to $BRANCH_NAME in this project." >&2
      exit 1
    fi

    alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" \
      --output "$temporary_directory/alias.json" \
      --write-out '%{http_code}' \
      "https://api.vercel.com/v4/aliases/${encoded_hostname}?teamId=${encoded_team}")"
    if [[ "$alias_status" != "200" && "$alias_status" != "404" ]]; then
      echo "Vercel returned HTTP $alias_status while reading the alias for $hostname." >&2
      exit 1
    fi
    if [[ "$alias_status" == "200" ]] && ! jq -e --arg project "$VERCEL_PROJECT_ID" '.projectId == $project' \
      "$temporary_directory/alias.json" >/dev/null; then
      echo "$hostname is currently aliased outside the configured project." >&2
      exit 1
    fi
    if [[ "$alias_status" == "200" ]]; then
      remove_alias_status="$(curl --silent --show-error --max-time 20 --retry 3 \
        --request DELETE \
        --header "Authorization: Bearer ${VERCEL_TOKEN}" \
        --output "$temporary_directory/remove-alias.json" \
        --write-out '%{http_code}' \
        "https://api.vercel.com/v2/aliases/${encoded_hostname}?teamId=${encoded_team}")"
      if [[ "$remove_alias_status" != "200" && "$remove_alias_status" != "404" ]]; then
        echo "Vercel returned HTTP $remove_alias_status while removing the alias for $hostname." >&2
        exit 1
      fi
    fi

    delete_status="$(curl --silent --show-error --max-time 20 --retry 3 \
      --request DELETE \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" \
      --output "$temporary_directory/delete-response.json" \
      --write-out '%{http_code}' \
      "$domain_url")"
    if [[ "$delete_status" != "200" && "$delete_status" != "404" ]]; then
      echo "Vercel returned HTTP $delete_status while removing $hostname." >&2
      exit 1
    fi
    echo "Removed $hostname."
    ;;
esac
