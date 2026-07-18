import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const shellScripts = [
  "manage-preview-domain.sh",
  "reset-database.sh",
  "test-docker-runtime.sh",
  "use-live-data.sh",
  "vercel-build.sh",
];

describe("shell scripts", () => {
  it("parses with the repository's Bash runtime", () => {
    const result = spawnSync("bash", ["-n", ...shellScripts.map((file) => join(root, "scripts", file))], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("exercises self-hosted webhook delivery without an external receiver", () => {
    const script = readFileSync(join(root, "scripts/test-docker-runtime.sh"), "utf8");

    expect(script).toContain("docker build --target builder");
    expect(script).toContain("docker build --target runner");
    expect(script).toContain("docker network create --internal");
    expect(script).toContain("WORKFLOW_POSTGRES_URL");
    expect(script).toContain("WORKFLOW_TARGET_WORLD=@workflow/world-postgres");
    expect(script).toContain("http://receiver:8787");
    expect(script).toContain('crypto.createHmac("sha256", webhookSecret).update(body)');
    expect(script).toContain("state.attempts === 3");
    expect(script).toContain('FROM "WebhookDelivery"');
    expect(script).toContain("docker image rm --force");
    expect(script).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(script).not.toContain("NODE_EXTRA_CA_CERTS");
    expect(script).not.toContain("openssl");
  });

  it("keeps the live-data source interactive, ephemeral, and read-only", () => {
    const script = readFileSync(join(root, "scripts/use-live-data.sh"), "utf8");
    const exportIndex = script.indexOf("pg_dump");
    const archiveCheckIndex = script.indexOf("pg_restore --list");
    const localDropIndex = script.indexOf("dropdb --if-exists", archiveCheckIndex);

    expect(script).toContain("read -r -s -p");
    expect(script).toContain("default_transaction_read_only=on");
    expect(script).toContain('pg_dump "$production_url"');
    expect(script).not.toContain("LIVE_DATA_SOURCE_URL");
    expect(archiveCheckIndex).toBeGreaterThan(exportIndex);
    expect(localDropIndex).toBeGreaterThan(archiveCheckIndex);
    expect(script).toContain('"enabled" = false');
    expect(script).toContain("https://disabled.invalid/webhooks/");
    expect(script).toContain('rm -rf "$temporary_directory"');
  });

  it("keeps the Vercel build forward-only and visibly ordered", () => {
    const script = readFileSync(join(root, "scripts/vercel-build.sh"), "utf8");
    const directUrl = script.indexOf('export DIRECT_URL="$DATABASE_URL_UNPOOLED"');
    const migrate = script.indexOf("prisma migrate deploy");
    const seed = script.indexOf("tsx prisma/seed.ts");
    const build = script.indexOf("yarn build");

    expect(directUrl).toBeGreaterThanOrEqual(0);
    expect(script).not.toContain('-z "${DIRECT_URL:-}"');
    expect(migrate).toBeGreaterThan(directUrl);
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(seed).toBeGreaterThan(migrate);
    expect(build).toBeGreaterThan(seed);
    expect(script).not.toContain("prisma generate");
    expect(script).not.toContain("next build");
    expect(script).not.toMatch(/reset|unipile/i);
    expect(script).not.toMatch(/neon|supabase/i);
    expect(script).not.toMatch(/WORKFLOW_|workflow:setup/);
  });

  it("keeps Vercel branch domains on the ready deployment", () => {
    const script = readFileSync(join(root, "scripts/manage-preview-domain.sh"), "utf8");
    const workflow = readFileSync(join(root, ".github/workflows/preview-domain.yml"), "utf8");

    expect(workflow).toContain("status:");
    expect(workflow).toContain("delete:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("create:");
    expect(workflow).toContain("github.event.context == 'Vercel'");
    expect(workflow).toContain(
      "startsWith(github.event.target_url, 'https://vercel.com/customermates/customermates/')",
    );
    expect(workflow).toContain("branches-where-head");
    expect(workflow).toContain("was recreated; keeping its domain");
    expect(workflow).toContain("github.repository == 'customermates/customermates'");
    expect(workflow).toContain("group: preview-domain-control");
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).not.toContain("repository_dispatch");
    expect(script).toContain("/v10/projects/${encoded_project}/domains");
    expect(script).toContain('--arg branch "$BRANCH_NAME"');
    expect(script).toContain("gitBranch: $branch");
    expect(script).toContain("/v7/deployments?");
    expect(script).toContain("state=READY");
    expect(script).toContain("&branch=${encoded_branch}");
    expect(script).toContain("&sha=${encoded_sha}");
    expect(script).toContain("/v2/deployments/${deployment_id}/aliases");
    expect(script).toContain("/v2/aliases/${encoded_alias_id}");
    expect(script).toContain("--request DELETE");
  });

  it("skips an ambiguous sandbox name before any provider request", () => {
    const result = spawnSync("bash", [join(root, "scripts/manage-preview-domain.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        BRANCH_NAME: "sandbox/feat-rewe",
        EVENT_ACTION: "create",
        PREVIEW_DOMAIN: "customermates.com",
        VERCEL_PROJECT_ID: "prj_test",
        VERCEL_TEAM_ID: "team_test",
        VERCEL_TOKEN: "test-token",
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("collides");
  });
});
