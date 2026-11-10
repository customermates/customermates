import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/ensure-production-deploy.sh");
const directories: string[] = [];
const SHA = "b".repeat(40);

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function run(
  env: Record<string, string>,
  { lists, createStatus = "200" }: { lists: object[][]; createStatus?: string },
) {
  const directory = mkdtempSync(join(tmpdir(), "customermates-production-deploy-test-"));
  directories.push(directory);
  const log = join(directory, "curl.log");
  const counter = join(directory, "count");
  writeFileSync(log, "");
  writeFileSync(counter, "0");
  lists.forEach((deployments, index) =>
    writeFileSync(join(directory, `list-${index}.json`), JSON.stringify({ deployments })),
  );
  writeFileSync(join(directory, "created.json"), JSON.stringify({ id: "dpl_new", url: "customermates-new.vercel.app" }));
  writeFileSync(
    join(directory, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output="/dev/null"; data=""; url=""; method="GET"
while (( $# )); do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --data) data="$2"; shift 2 ;;
    --request) method="$2"; shift 2 ;;
    --header|--max-time|--write-out) shift 2 ;;
    --silent|--show-error) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ "$method" == "GET" ]]; then
  count=$(cat ${JSON.stringify(counter)}); last=${lists.length - 1}
  index=$(( count < last ? count : last )); echo $((count + 1)) > ${JSON.stringify(counter)}
  printf 'GET %s\\n' "$url" >> ${JSON.stringify(log)}
  cp ${JSON.stringify(directory)}/list-$index.json "$output"; printf 200
else
  printf 'POST %s %s\\n' "$url" "$(cat "\${data#@}")" >> ${JSON.stringify(log)}
  cp ${JSON.stringify(join(directory, "created.json"))} "$output"; printf '%s' ${JSON.stringify(createStatus)}
fi
`,
  );
  chmodSync(join(directory, "curl"), 0o755);
  writeFileSync(join(directory, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(directory, "sleep"), 0o755);
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      VERCEL_TOKEN: "token",
      COMMIT_SHA: SHA,
      WAIT_SECONDS: "0",
      POLL_SECONDS: "0",
      ...env,
    },
  });
  return { ...result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
}

const deployment = (sha: string, state = "BUILDING") => ({ uid: "dpl_vercel", state, meta: { githubCommitSha: sha } });

describe("production deploy check", () => {
  it("leaves production alone when Vercel already deploys the pushed commit", () => {
    const result = run({}, { lists: [[deployment(SHA)]] });
    expect(result.status).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toBe(
      `GET https://api.vercel.com/v6/deployments?teamId=team_test&projectId=prj_test&target=production&sha=${SHA}&limit=5`,
    );
    expect(result.stdout).toContain("dpl_vercel BUILDING");
  });

  it("keeps waiting while Vercel has not started yet and stops once it has", () => {
    const result = run({ WAIT_SECONDS: "600" }, { lists: [[], [], [deployment(SHA, "READY")]] });
    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("POST"))).toHaveLength(0);
    expect(result.calls).toHaveLength(3);
  });

  it("starts a production build of exactly the pushed commit when none appears", () => {
    const result = run({}, { lists: [[deployment("c".repeat(40))]] });
    expect(result.status).toBe(0);
    const post = result.calls.find((call) => call.startsWith("POST"));
    expect(post).toBeDefined();
    const [, url, ...body] = post!.split(" ");
    expect(url).toBe("https://api.vercel.com/v13/deployments?teamId=team_test");
    expect(JSON.parse(body.join(" "))).toMatchObject({
      project: "prj_test",
      target: "production",
      gitSource: { type: "github", org: "customermates", repo: "customermates", ref: "main", sha: SHA },
    });
    expect(result.stdout).toContain("started dpl_new");
  });

  it("fails loudly when Vercel refuses the build", () => {
    const result = run({}, { lists: [[]], createStatus: "403" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HTTP 403");
  });

  it("refuses a malformed commit without calling Vercel", () => {
    const result = run({ COMMIT_SHA: "abc" }, { lists: [[]] });
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(0);
  });
});
