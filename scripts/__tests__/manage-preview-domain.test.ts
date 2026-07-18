import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/manage-preview-domain.sh");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function runDomainScript({
  action = "deploy",
  aliasDeploymentId = "dpl_old",
  aliasProject = "prj_test",
  aliasStatus = "404",
  branch = "feat/oauth",
  branchSha = "a".repeat(40),
  branchStatus = "200",
  createVerified = true,
  deploymentProject = "prj_test",
  deploymentReadyState = "READY",
  deploymentReportSha = "a".repeat(40),
  deploymentSha = "a".repeat(40),
  deploymentSource = "git",
  deploymentTarget = "",
  domainBranch = "feat/oauth",
  domainProject = "prj_test",
  domainStatus = "404",
  domainVerified = true,
  previewDomain = "customermates.com",
}: {
  action?: "deploy" | "delete";
  aliasDeploymentId?: string;
  aliasProject?: string;
  aliasStatus?: "200" | "404";
  branch?: string;
  branchSha?: string;
  branchStatus?: "200" | "404";
  createVerified?: boolean;
  deploymentProject?: string;
  deploymentReadyState?: string;
  deploymentReportSha?: string;
  deploymentSha?: string;
  deploymentSource?: string;
  deploymentTarget?: string;
  domainBranch?: string;
  domainProject?: string;
  domainStatus?: "200" | "404";
  domainVerified?: boolean;
  previewDomain?: string;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "customermates-preview-domain-test-"));
  temporaryDirectories.push(directory);
  const domainBody = join(directory, "domain-body.json");
  const aliasBody = join(directory, "alias-body.json");
  const log = join(directory, "curl.log");
  const curl = join(directory, "curl");
  writeFileSync(log, "");

  writeFileSync(
    curl,
    `#!/usr/bin/env bash
set -euo pipefail

request="GET"
output="/dev/null"
data=""
url=""

while (( $# )); do
  case "$1" in
    --request)
      request="$2"
      shift 2
      ;;
    --output)
      output="$2"
      shift 2
      ;;
    --data-binary)
      data="$2"
      shift 2
      ;;
    --header|--max-time|--retry|--write-out)
      shift 2
      ;;
    --show-error|--silent)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

printf '%s\t%s\n' "$request" "$url" >> "$MOCK_CURL_LOG"
status="500"
response='{}'

case "$url" in
  https://api.vercel.com/v13/deployments/*)
    status="200"
    target="null"
    if [[ -n "$MOCK_DEPLOYMENT_TARGET" ]]; then
      target="$(jq -cn --arg value "$MOCK_DEPLOYMENT_TARGET" '$value')"
    fi
    response="$(jq -cn \
      --arg id "dpl_new" \
      --arg project "$MOCK_DEPLOYMENT_PROJECT" \
      --arg readyState "$MOCK_DEPLOYMENT_READY_STATE" \
      --arg branch "$BRANCH_NAME" \
      --arg sha "$MOCK_DEPLOYMENT_SHA" \
      --arg source "$MOCK_DEPLOYMENT_SOURCE" \
      --argjson target "$target" \
      '{id: $id, project: {id: $project}, readyState: $readyState, source: $source, target: $target, meta: {githubCommitOrg: "customermates", githubCommitRepo: "customermates", githubCommitRef: $branch, githubCommitSha: $sha}}')"
    ;;
  https://api.github.com/repos/customermates/customermates/git/ref/heads/*)
    status="$MOCK_BRANCH_STATUS"
    if [[ "$status" == "200" ]]; then
      response="$(jq -cn --arg sha "$MOCK_BRANCH_SHA" '{object: {type: "commit", sha: $sha}}')"
    fi
    ;;
  https://api.vercel.com/v9/projects/*/domains/*)
    if [[ "$request" == "DELETE" ]]; then
      status="200"
      response='{"status":"SUCCESS"}'
    else
      status="$MOCK_DOMAIN_STATUS"
      if [[ "$status" == "200" ]]; then
        response="$(jq -cn \
          --arg name "$MOCK_HOSTNAME" \
          --arg project "$MOCK_DOMAIN_PROJECT" \
          --arg branch "$MOCK_DOMAIN_BRANCH" \
          --argjson verified "$MOCK_DOMAIN_VERIFIED" \
          '{name: $name, projectId: $project, gitBranch: $branch, verified: $verified}')"
      fi
    fi
    ;;
  https://api.vercel.com/v10/projects/*/domains*)
    status="200"
    cp "\${data#@}" "$MOCK_DOMAIN_BODY"
    response="$(jq -cn \
      --arg name "$MOCK_HOSTNAME" \
      --arg project "$VERCEL_PROJECT_ID" \
      --arg branch "$BRANCH_NAME" \
      --argjson verified "$MOCK_CREATE_VERIFIED" \
      '{name: $name, projectId: $project, gitBranch: $branch, verified: $verified}')"
    ;;
  https://api.vercel.com/v4/aliases/*)
    status="$MOCK_ALIAS_STATUS"
    if [[ "$status" == "200" ]]; then
      response="$(jq -cn \
        --arg alias "$MOCK_HOSTNAME" \
        --arg deployment "$MOCK_ALIAS_DEPLOYMENT_ID" \
        --arg project "$MOCK_ALIAS_PROJECT" \
        '{alias: $alias, deploymentId: $deployment, projectId: $project}')"
    fi
    ;;
  https://api.vercel.com/v2/deployments/*/aliases*)
    status="200"
    cp "\${data#@}" "$MOCK_ALIAS_BODY"
    response="$(jq -cn --arg alias "$MOCK_HOSTNAME" '{uid: "alias_new", alias: $alias}')"
    ;;
  https://api.vercel.com/v2/aliases/*)
    status="200"
    response='{"status":"SUCCESS"}'
    ;;
esac

printf '%s' "$response" > "$output"
printf '%s' "$status"
`,
  );
  chmodSync(curl, 0o755);

  const hostname = branch === "sandbox/rewe" ? "rewe.customermates.com" : "feat-oauth.customermates.com";
  const result = spawnSync("bash", [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      BRANCH_NAME: branch,
      DEPLOYMENT_SHA: action === "deploy" ? deploymentReportSha : "",
      DEPLOYMENT_URL: "https://customermates-preview-abc.vercel.app",
      EVENT_ACTION: action,
      GITHUB_TOKEN: "github-test-token",
      MOCK_ALIAS_BODY: aliasBody,
      MOCK_ALIAS_DEPLOYMENT_ID: aliasDeploymentId,
      MOCK_ALIAS_PROJECT: aliasProject,
      MOCK_ALIAS_STATUS: aliasStatus,
      MOCK_BRANCH_SHA: branchSha,
      MOCK_BRANCH_STATUS: branchStatus,
      MOCK_CREATE_VERIFIED: String(createVerified),
      MOCK_CURL_LOG: log,
      MOCK_DEPLOYMENT_PROJECT: deploymentProject,
      MOCK_DEPLOYMENT_READY_STATE: deploymentReadyState,
      MOCK_DEPLOYMENT_SHA: deploymentSha,
      MOCK_DEPLOYMENT_SOURCE: deploymentSource,
      MOCK_DEPLOYMENT_TARGET: deploymentTarget,
      MOCK_DOMAIN_BODY: domainBody,
      MOCK_DOMAIN_BRANCH: domainBranch,
      MOCK_DOMAIN_PROJECT: domainProject,
      MOCK_DOMAIN_STATUS: domainStatus,
      MOCK_DOMAIN_VERIFIED: String(domainVerified),
      MOCK_HOSTNAME: hostname,
      PREVIEW_DOMAIN: previewDomain,
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      VERCEL_TOKEN: "vercel-test-token",
    },
  });

  return {
    ...result,
    aliasBody: readFileSync(aliasBody, { encoding: "utf8", flag: "a+" }),
    domainBody: readFileSync(domainBody, { encoding: "utf8", flag: "a+" }),
    requests: readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
  };
}

describe("Preview-domain management", () => {
  it.each(["feature/contact-import", "sandbox/demo", "sandbox/feat-rewe", "feat/add/inbox", "feat/xn--preview"])(
    "ignores an unmanaged or reserved deleted branch %s",
    (branch) => {
      const result = runDomainScript({ action: "delete", branch });

      expect(result.status, result.stderr).toBe(0);
      expect(result.requests).toHaveLength(0);
    },
  );

  it("creates a verified branch domain and aliases the completed deployment", () => {
    const result = runDomainScript();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("now serves the latest deployment for feat/oauth");
    expect(result.requests).toEqual([
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v13\/deployments\//),
      expect.stringMatching(/^GET\thttps:\/\/api\.github\.com\/repos\/customermates\/customermates\/git\/ref\/heads\//),
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v9\/projects\/prj_test\/domains\//),
      "POST\thttps://api.vercel.com/v10/projects/prj_test/domains?teamId=team_test",
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v4\/aliases\/[^?]+\?teamId=team_test$/),
      "POST\thttps://api.vercel.com/v2/deployments/dpl_new/aliases?teamId=team_test",
    ]);
    expect(JSON.parse(result.domainBody)).toEqual({
      name: "feat-oauth.customermates.com",
      gitBranch: "feat/oauth",
    });
    expect(JSON.parse(result.aliasBody)).toEqual({ alias: "feat-oauth.customermates.com" });
  });

  it("keeps an existing matching alias without another mutation", () => {
    const result = runDomainScript({ aliasDeploymentId: "dpl_new", aliasStatus: "200", domainStatus: "200" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("already serves the latest deployment");
    expect(result.requests).toHaveLength(4);
  });

  it("moves an existing same-project alias to the latest deployment", () => {
    const result = runDomainScript({ aliasStatus: "200", domainStatus: "200" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.requests.at(-1)).toBe(
      "POST\thttps://api.vercel.com/v2/deployments/dpl_new/aliases?teamId=team_test",
    );
  });

  it("never lets a stale completed deployment take the branch domain", () => {
    const result = runDomainScript({ branchSha: "b".repeat(40) });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("not the latest commit");
    expect(result.requests).toHaveLength(2);
  });

  it("ignores a completed deployment after its branch was removed", () => {
    const result = runDomainScript({ branchStatus: "404" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("no longer exists");
    expect(result.requests).toHaveLength(2);
  });

  it("rejects Production or cross-project deployments before changing a domain", () => {
    const production = runDomainScript({ deploymentTarget: "production" });
    const anotherProject = runDomainScript({ deploymentProject: "prj_other" });

    for (const result of [production, anotherProject]) {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("not a ready Customermates Preview");
      expect(result.requests).toHaveLength(1);
    }
  });

  it("does not trust Vercel's non-authoritative deployment source hint", () => {
    const result = runDomainScript({ deploymentSource: "cli" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("now serves the latest deployment");
  });

  it("rejects a deployment report that does not match Vercel metadata", () => {
    const result = runDomainScript({ deploymentReportSha: "b".repeat(40) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match");
    expect(result.requests).toHaveLength(1);
  });

  it("does not take over a hostname assigned to another branch or project", () => {
    const otherBranch = runDomainScript({ domainBranch: "feat/other", domainStatus: "200" });
    const otherProject = runDomainScript({ domainProject: "prj_other", domainStatus: "200" });

    for (const result of [otherBranch, otherProject]) {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("already assigned");
      expect(result.requests).toHaveLength(3);
    }
  });

  it("does not move an alias from another project", () => {
    const result = runDomainScript({ aliasProject: "prj_other", aliasStatus: "200", domainStatus: "200" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("aliased outside the configured project");
    expect(result.requests).toHaveLength(4);
    expect(result.requests.at(-1)).toMatch(/^GET\thttps:\/\/api\.vercel\.com\/v4\/aliases\/[^?]+\?teamId=team_test$/);
  });

  it("ignores a stale deletion event when the branch exists again", () => {
    const result = runDomainScript({ action: "delete" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("exists again");
    expect(result.requests).toEqual([
      expect.stringMatching(/^GET\thttps:\/\/api\.github\.com\/repos\/customermates\/customermates\/git\/ref\/heads\//),
    ]);
  });

  it("removes the alias before removing the deleted branch domain", () => {
    const result = runDomainScript({ action: "delete", aliasStatus: "200", branchStatus: "404", domainStatus: "200" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.requests).toEqual([
      expect.stringMatching(/^GET\thttps:\/\/api\.github\.com\/repos\/customermates\/customermates\/git\/ref\/heads\//),
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v9\/projects\/prj_test\/domains\//),
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v4\/aliases\/[^?]+\?teamId=team_test$/),
      expect.stringMatching(/^DELETE\thttps:\/\/api\.vercel\.com\/v2\/aliases\//),
      expect.stringMatching(/^DELETE\thttps:\/\/api\.vercel\.com\/v9\/projects\/prj_test\/domains\//),
    ]);
  });

  it("does not remove an alias from another project", () => {
    const result = runDomainScript({
      action: "delete",
      aliasProject: "prj_other",
      aliasStatus: "200",
      branchStatus: "404",
      domainStatus: "200",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("aliased outside the configured project");
    expect(result.requests).toHaveLength(3);
  });

  it("treats an already-removed branch domain as success", () => {
    const result = runDomainScript({ action: "delete", branchStatus: "404" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("already removed");
    expect(result.requests).toHaveLength(2);
  });

  it("rejects an invalid Preview suffix before reading a domain", () => {
    const result = runDomainScript({ action: "delete", previewDomain: "*.customermates.com" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PREVIEW_DOMAIN must be a lowercase DNS hostname");
    expect(result.requests).toHaveLength(0);
  });

  it("uses an unprivileged ready-deployment report and a protected main workflow", () => {
    const requestWorkflow = readFileSync(join(root, ".github/workflows/preview-domain-request.yml"), "utf8");
    const controlWorkflow = readFileSync(join(root, ".github/workflows/preview-domain.yml"), "utf8");

    expect(requestWorkflow).toContain("  deployment_status:");
    expect(requestWorkflow).toContain("github.event.deployment.creator.login == 'vercel[bot]'");
    expect(requestWorkflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(requestWorkflow).not.toContain("VERCEL_TOKEN");
    expect(requestWorkflow).not.toContain("preview-domain-control");

    expect(controlWorkflow).toContain("  workflow_run:");
    expect(controlWorkflow).toContain("  delete:");
    expect(controlWorkflow).toContain("environment:");
    expect(controlWorkflow).toContain("name: preview-domain-control");
    expect(controlWorkflow).toContain("ref: ${{ github.sha }}");
    expect(controlWorkflow).not.toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(controlWorkflow).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(controlWorkflow).not.toContain("  create:");
  });
});
