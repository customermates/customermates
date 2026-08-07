import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("open-core licence boundary", () => {
  it("licenses the core and audit log under AGPL-3.0-only", () => {
    const rootLicense = source("LICENSE");
    const readme = source("README.md");

    expect(rootLicense).toContain("Files outside `ee/` are licensed");
    expect(rootLicense).toContain("AGPL-3.0-only");
    expect(readme).toContain("including `features/audit-log/`");
    expect(existsSync(join(REPO_ROOT, "features/audit-log/prisma-audit-log.repository.ts"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "ee/audit-log"))).toBe(false);
  });

  it("permits the mixed Community image without licensing Enterprise Features", () => {
    const rootLicense = source("LICENSE");
    const commercialLicense = source("ee/LICENSE.md");
    const enterpriseReadme = source("ee/README.md");

    expect(rootLicense).toContain("Additional permission for Community Builds under section 7 of AGPLv3");
    expect(rootLicense).toContain("section 5(c) of AGPLv3 does not require the unmodified Commercial Software");
    expect(commercialLicense).toContain("Any person or organisation may copy, install, and run");
    expect(commercialLicense).toContain("APP_MODE=self-hosted");
    expect(commercialLicense).toContain(
      "does not authorise you to deliberately make an Enterprise Feature operational",
    );
    expect(commercialLicense).toContain("Inert compiled routes, schemas, interface declarations");
    expect(enterpriseReadme).toContain("First-party files in `ee/` are Commercial Software");
  });

  it("defines the image and revision-specific licence terms deterministically", () => {
    const commercialLicense = source("ee/LICENSE.md");

    expect(commercialLicense).toContain("**Community Edition**");
    expect(commercialLicense).toContain("**Applicable Documentation**");
    expect(commercialLicense).toContain("`ghcr.io/customermates/customermates`");
    expect(commercialLicense).toContain("Ordinary compilation, bundling, minification");
  });

  it("ships both first-party licence notices in the runtime image", () => {
    const dockerfile = source("Dockerfile");
    const compose = source("docker-compose.yml");

    expect(dockerfile).toContain("COPY --from=builder /app/LICENSE ./LICENSE");
    expect(dockerfile).toContain("COPY --from=builder /app/ee/LICENSE.md ./ee/LICENSE.md");
    expect(compose).toMatch(/APP_MODE:\s*self-hosted/);
  });
});
