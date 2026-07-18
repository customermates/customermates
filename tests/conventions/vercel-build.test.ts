import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("Vercel build safety", () => {
  it("migrates forward and seeds only previews before building", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    const directUrl = script.indexOf('export DIRECT_URL="$DATABASE_URL_UNPOOLED"');
    const migrate = script.indexOf("npx --no-install prisma migrate deploy");
    const preview = script.indexOf('[[ "${VERCEL_ENV:-}" == "preview" ]]');
    const seed = script.indexOf("npx --no-install tsx prisma/seed.ts");
    const build = script.indexOf("yarn build");

    expect(directUrl).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(directUrl);
    expect(migrate).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(migrate);
    expect(seed).toBeGreaterThan(preview);
    expect(build).toBeGreaterThan(seed);
    expect(script).not.toMatch(/reset|unipile/i);
  });

  it("uses the same safe build command for every Vercel deployment", () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const vercelJson = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

    expect(packageJson.scripts["vercel-build"]).toBe("bash scripts/vercel-build.sh");
    expect(packageJson.scripts["vercel-preview-build"]).toBeUndefined();
    expect(vercelJson.buildCommand).toBe("yarn vercel-build");
    expect(vercelJson.git?.deploymentEnabled).toBe(true);
  });
});
