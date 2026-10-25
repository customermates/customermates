import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/redeploy-demo.sh");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function run({
  currentStatus = "200",
  project = "prj_test",
  readyState = "READY",
  redeployStatus = "200",
}: { currentStatus?: string; project?: string; readyState?: string; redeployStatus?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "customermates-demo-redeploy-test-"));
  directories.push(directory);
  const log = join(directory, "curl.log");
  const current = join(directory, "current.json");
  const redeploy = join(directory, "redeploy.json");
  writeFileSync(log, "");
  writeFileSync(
    current,
    JSON.stringify({ id: "dpl_current", name: "customermates", project: { id: project }, readyState }),
  );
  writeFileSync(redeploy, JSON.stringify({ id: "dpl_new" }));
  writeFileSync(
    join(directory, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
request="GET"; output="/dev/null"; data=""; url=""
while (( $# )); do
  case "$1" in
    --request) request="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    --data) data="$2"; shift 2 ;;
    --header|--max-time|--retry|--write-out) shift 2 ;;
    --silent|--show-error) shift ;;
    *) url="$1"; shift ;;
  esac
done
body=""
if [[ "$data" == @* ]]; then body="$(cat "\${data#@}")"; fi
printf '%s %s %s\\n' "$request" "$url" "$body" >> ${JSON.stringify(log)}
if [[ "$request" == "POST" ]]; then cp ${JSON.stringify(redeploy)} "$output"; printf '%s' ${JSON.stringify(redeployStatus)}
else cp ${JSON.stringify(current)} "$output"; printf '%s' ${JSON.stringify(currentStatus)}; fi
`,
  );
  chmodSync(join(directory, "curl"), 0o755);
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      VERCEL_TOKEN: "token",
      DEMO_HOST: "",
    },
  });
  return { ...result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

describe("demo redeploy", () => {
  it("rebuilds the deployment behind the demo domain in the demo environment", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.calls[0]).toBe("GET https://api.vercel.com/v13/deployments/demo.customermates.com?teamId=team_test ");
    const [request, url, ...body] = result.calls[1].split(" ");
    expect([request, url]).toEqual(["POST", "https://api.vercel.com/v13/deployments?teamId=team_test&forceNew=1"]);
    expect(JSON.parse(body.join(" "))).toMatchObject({
      name: "customermates",
      project: "prj_test",
      deploymentId: "dpl_current",
      customEnvironmentSlugOrId: "demo",
    });
    expect(result.stdout).toContain("as dpl_new");
  });

  it("redeploys nothing when the demo domain points at another project or an unfinished deployment", () => {
    for (const options of [{ project: "prj_other" }, { readyState: "BUILDING" }, { currentStatus: "404" }]) {
      const result = run(options);
      expect(result.status).toBe(1);
      expect(result.calls).toHaveLength(1);
    }
  });

  it("fails when Vercel refuses the redeploy", () => {
    expect(run({ redeployStatus: "403" }).status).toBe(1);
  });
});
