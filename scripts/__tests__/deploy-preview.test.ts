import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/deploy-preview.sh");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function run(env: Record<string, string>, status = "200") {
  const directory = mkdtempSync(join(tmpdir(), "customermates-preview-deploy-test-"));
  directories.push(directory);
  const log = join(directory, "curl.log");
  const response = join(directory, "response.json");
  writeFileSync(log, "");
  writeFileSync(response, JSON.stringify({ id: "dpl_new", url: "customermates-new.vercel.app" }));
  writeFileSync(
    join(directory, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output="/dev/null"; data=""; url=""
while (( $# )); do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --data) data="$2"; shift 2 ;;
    --request|--header|--max-time|--write-out) shift 2 ;;
    --silent|--show-error) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s %s\\n' "$url" "$(cat "\${data#@}")" >> ${JSON.stringify(log)}
cp ${JSON.stringify(response)} "$output"; printf '%s' ${JSON.stringify(status)}
`,
  );
  chmodSync(join(directory, "curl"), 0o755);
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      VERCEL_TOKEN: "token",
      NODE_ENV: "test",
      ...env,
    },
  });
  return { ...result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

describe("preview deploy", () => {
  it("starts a preview build of the branch at the labelled commit", () => {
    const sha = "a".repeat(40);
    const result = run({ BRANCH: "fix/production-errors", COMMIT_SHA: sha });
    expect(result.status).toBe(0);
    const [url, ...body] = result.calls[0].split(" ");
    expect(url).toBe("https://api.vercel.com/v13/deployments?teamId=team_test");
    const request = JSON.parse(body.join(" "));
    expect(request).toMatchObject({
      project: "prj_test",
      gitSource: { type: "github", org: "customermates", repo: "customermates", ref: "fix/production-errors", sha },
    });
    expect(request).not.toHaveProperty("customEnvironmentSlugOrId");
    expect(result.stdout).toContain("as dpl_new");
  });

  it("deploys the branch head on a manual run", () => {
    const result = run({ BRANCH: "feat/x" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.calls[0].split(" ").slice(1).join(" ")).gitSource).not.toHaveProperty("sha");
  });

  it("refuses main, malformed branches and commits without calling Vercel", () => {
    const cases: Record<string, string>[] = [
      { BRANCH: "main" },
      { BRANCH: "-x" },
      { BRANCH: "a b" },
      { BRANCH: "feat/x", COMMIT_SHA: "abc" },
    ];
    for (const env of cases) {
      const result = run(env);
      expect(result.status).toBe(1);
      expect(result.calls).toHaveLength(0);
    }
  });

  it("fails when Vercel refuses the deployment", () => {
    expect(run({ BRANCH: "feat/x" }, "403").status).toBe(1);
  });
});
