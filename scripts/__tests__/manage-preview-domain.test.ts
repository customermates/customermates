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
  action,
  aliasDeployment = "dpl_previous",
  aliasId = "alias_current",
  aliasStatus = "404",
  deploymentTarget = "",
  domainBranch = "feat/oauth",
  domainStatus = "404",
}: {
  action: "create" | "delete";
  aliasDeployment?: string;
  aliasId?: string;
  aliasStatus?: "200" | "404";
  deploymentTarget?: "" | "demo" | "production";
  domainBranch?: string;
  domainStatus?: "200" | "404";
}) {
  const directory = mkdtempSync(join(tmpdir(), "customermates-preview-domain-test-"));
  temporaryDirectories.push(directory);
  const log = join(directory, "curl.log");
  const curl = join(directory, "curl");

  writeFileSync(
    curl,
    `#!/usr/bin/env bash
set -euo pipefail

request="GET"
output="/dev/null"
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
    --data-binary|--header|--max-time|--retry|--write-out)
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
body='{}'
status="500"

case "$url" in
  *"/v9/projects/"*"/domains/"*)
    if [[ "$request" == "DELETE" ]]; then
      status="200"
    else
      status="$MOCK_DOMAIN_STATUS"
      if [[ "$status" == "200" ]]; then
        body="$(jq -cn --arg name "$MOCK_HOSTNAME" --arg project "$VERCEL_PROJECT_ID" --arg branch "$MOCK_DOMAIN_BRANCH" '{name: $name, projectId: $project, gitBranch: $branch}')"
      fi
    fi
    ;;
  *"/v7/deployments?"*)
    status="200"
    body="$(jq -cn --arg deployment "$MOCK_DEPLOYMENT_ID" --arg target "$MOCK_DEPLOYMENT_TARGET" '{deployments: [{uid: $deployment, state: "READY", target: (if $target == "" then null else $target end)}]}')"
    ;;
  *"/v10/projects/"*"/domains?"*)
    status="200"
    ;;
  *"/v4/aliases/"*)
    status="$MOCK_ALIAS_STATUS"
    if [[ "$status" == "200" ]]; then
      body="$(jq -cn --arg uid "$MOCK_ALIAS_ID" --arg alias "$MOCK_HOSTNAME" --arg project "$VERCEL_PROJECT_ID" --arg deployment "$MOCK_ALIAS_DEPLOYMENT" '{uid: $uid, alias: $alias, projectId: $project, deploymentId: $deployment}')"
    fi
    ;;
  *"/v2/deployments/"*"/aliases?"*)
    status="200"
    ;;
  *"/v2/aliases/"*)
    status="200"
    ;;
esac

printf '%s' "$body" > "$output"
printf '%s' "$status"
`,
  );
  chmodSync(curl, 0o755);

  const result = spawnSync("bash", [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      BRANCH_NAME: "feat/oauth",
      EVENT_ACTION: action,
      MOCK_ALIAS_DEPLOYMENT: aliasDeployment,
      MOCK_ALIAS_ID: aliasId,
      MOCK_ALIAS_STATUS: aliasStatus,
      MOCK_CURL_LOG: log,
      MOCK_DEPLOYMENT_ID: "dpl_current",
      MOCK_DEPLOYMENT_TARGET: deploymentTarget,
      MOCK_DOMAIN_BRANCH: domainBranch,
      MOCK_DOMAIN_STATUS: domainStatus,
      MOCK_HOSTNAME: "feat-oauth.customermates.com",
      PREVIEW_DOMAIN: "customermates.com",
      STATUS_SHA: "sha_current",
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      VERCEL_TOKEN: "test-token",
    },
  });

  return {
    ...result,
    requests: readFileSync(log, "utf8").trim().split("\n"),
  };
}

describe("Preview-domain management", () => {
  it("creates the branch mapping and aliases the ready deployment", () => {
    const result = runDomainScript({ action: "create" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("dpl_current");
    expect(result.requests).toEqual([
      expect.stringMatching(/^GET\thttps:\/\/api\.vercel\.com\/v9\/projects\/prj_test\/domains\//),
      expect.stringContaining("/v7/deployments?projectId=prj_test&teamId=team_test&state=READY&branch=feat%2Foauth&limit=1&sha=sha_current"),
      expect.stringContaining("POST\thttps://api.vercel.com/v10/projects/prj_test/domains?teamId=team_test"),
      expect.stringContaining("GET\thttps://api.vercel.com/v4/aliases/"),
      expect.stringContaining("POST\thttps://api.vercel.com/v2/deployments/dpl_current/aliases?teamId=team_test"),
    ]);
  });

  it("moves an existing branch alias to the new ready deployment", () => {
    const result = runDomainScript({ action: "create", aliasStatus: "200", domainStatus: "200" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.requests.some((request) => request.includes("/v10/projects/"))).toBe(false);
    expect(result.requests.at(-1)).toContain("/v2/deployments/dpl_current/aliases");
  });

  it("leaves an already-correct alias unchanged", () => {
    const result = runDomainScript({
      action: "create",
      aliasDeployment: "dpl_current",
      aliasStatus: "200",
      domainStatus: "200",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("already points to dpl_current");
    expect(result.requests.filter((request) => request.startsWith("POST\t"))).toHaveLength(0);
  });

  it("removes the deployment alias before the branch mapping", () => {
    const result = runDomainScript({ action: "delete", aliasStatus: "200", domainStatus: "200" });

    expect(result.status, result.stderr).toBe(0);
    const aliasDelete = result.requests.findIndex((request) =>
      request.includes("DELETE\thttps://api.vercel.com/v2/aliases/alias_current?"),
    );
    const domainDelete = result.requests.findIndex((request) => request.includes("DELETE\thttps://api.vercel.com/v9/projects/"));
    expect(aliasDelete).toBeGreaterThanOrEqual(0);
    expect(domainDelete).toBeGreaterThan(aliasDelete);
  });

  it.each(["demo", "production"] as const)("refuses to alias a targeted %s deployment", (deploymentTarget) => {
    const result = runDomainScript({ action: "create", deploymentTarget });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`targeted ${deploymentTarget} deployment`);
    expect(result.requests.some((request) => request.startsWith("POST\t") || request.startsWith("DELETE\t"))).toBe(
      false,
    );
  });

  it("refuses to delete an alias without its Vercel ID", () => {
    const result = runDomainScript({ action: "delete", aliasId: "", aliasStatus: "200", domainStatus: "200" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("without an ID");
    expect(result.requests.some((request) => request.startsWith("DELETE\t"))).toBe(false);
  });

  it("does not mutate a hostname mapped to another branch", () => {
    const result = runDomainScript({ action: "create", domainBranch: "feat/other", domainStatus: "200" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assigned to another branch");
    expect(result.requests.some((request) => request.startsWith("POST\t") || request.startsWith("DELETE\t"))).toBe(
      false,
    );
  });
});
