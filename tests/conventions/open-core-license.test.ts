import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("source-available licence boundary", () => {
  it("licenses the code base under the Sustainable Use License with ee/ carved out", () => {
    const rootLicense = source("LICENSE.md");

    expect(existsSync(join(REPO_ROOT, "LICENSE"))).toBe(false);
    expect(rootLicense.trimStart()).toMatch(/^# License\b/);
    expect(rootLicense).toContain("## Sustainable Use License");
    expect(rootLicense).toContain("Version 1.0");
    expect(rootLicense).toContain("Benjamin Wagner, doing business as Customermates");
    expect(rootLicense).toContain("Source code files under the `ee/` directory are NOT licensed under the Sustainable Use License.");
    expect(rootLicense).toContain("`ee/LICENSE.md`");
    expect(rootLicense).toContain("All third party components incorporated into the Customermates Software");
    expect(rootLicense).toContain("Compiled and object-code artifacts remain subject");
    expect(rootLicense).toContain("Content outside of the above mentioned files or restrictions");
    expect(rootLicense).toContain("only for your own internal business purposes or for non-commercial or");
    expect(rootLicense).not.toMatch(/AFFERO|AGPL/);
    expect(existsSync(join(REPO_ROOT, "features/event/prisma-event-log.repository.ts"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "ee/event"))).toBe(false);
  });

  it("answers the licence questions and does not call the product open source", () => {
    const licensing = source("LICENSING.md");

    for (const heading of [
      "## What licence do you use?",
      "## What is covered by which licence?",
      "## What can I do?",
      "## What can't I do?",
      "## Examples",
      "## Is Customermates open source?",
    ])
      expect(licensing).toContain(heading);
    expect(licensing).toContain("source-available and fair-code");
    expect(licensing).toContain("No. The source code is available under the Sustainable Use License");
    expect(licensing).toContain("Allowed. This is an internal business purpose");
    expect(licensing).toContain("Needs an enterprise licence.");
    expect(licensing).toContain("Not allowed.");
    expect(licensing).toContain("Branding stays visible.");
    expect(licensing).not.toContain("Additional permission for Community Builds under section 7");
  });

  it("keeps the Enterprise License clauses that n8n's enterprise licence has and the Community Build permission", () => {
    const commercialLicense = source("ee/LICENSE.md");
    const enterpriseReadme = source("ee/README.md");

    expect(commercialLicense).toContain("Version 1.1, 16 November 2026");
    expect(commercialLicense).toContain("## 2. Development and Testing");
    expect(commercialLicense).toContain("requires a valid Commercial Agreement corresponding to your usage");
    expect(commercialLicense).toContain("A modification or patch may be used, copied, modified, displayed, distributed");
    expect(commercialLicense).toContain("it is forbidden to copy, merge, publish, distribute, sublicense, and/or sell");
    expect(commercialLicense).toContain("those\ncomponents are licensed under the original license provided by the owner");
    expect(commercialLicense).toContain("Any person or organisation may copy, install, and run");
    expect(commercialLicense).toContain("APP_MODE=self-hosted");
    expect(commercialLicense).toContain(
      "does not authorise you to deliberately make an Enterprise Feature operational",
    );
    expect(commercialLicense).toContain("Inert compiled routes, schemas, interface declarations");
    expect(commercialLicense).not.toMatch(/AGPL|Affero/i);
    expect(enterpriseReadme).toContain("First-party files in `ee/` are Commercial Software");
    expect(enterpriseReadme).toContain("The hosted in-app Assistant is a Cloud-only Enterprise Feature.");
    expect(enterpriseReadme).not.toMatch(/AGPL|Affero/i);
  });

  it("defines the image and revision-specific licence terms deterministically", () => {
    const commercialLicense = source("ee/LICENSE.md");

    expect(commercialLicense).toContain("**Community Edition**");
    expect(commercialLicense).toContain("**Applicable Documentation**");
    expect(commercialLicense).toContain("`ghcr.io/customermates/customermates`");
    expect(commercialLicense).toContain("Ordinary compilation, bundling, minification");
  });

  it("ships the first-party licence notices in the runtime image", () => {
    const dockerfile = source("Dockerfile");
    const compose = source("docker-compose.yml");

    for (const [from, to] of [
      ["LICENSE.md", "LICENSE.md"],
      ["LICENSING.md", "LICENSING.md"],
      ["NOTICE", "NOTICE"],
      ["TRADEMARK.md", "TRADEMARK.md"],
      ["ee/LICENSE.md", "ee/LICENSE.md"],
      ["THIRD_PARTY_LICENSES.md", "THIRD_PARTY_LICENSES.md"],
      ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
    ])
      expect(dockerfile).toContain(`COPY --from=builder /app/${from} ./${to}`);
    expect(compose).toMatch(/APP_MODE:\s*self-hosted/);
  });

  it("names the licence in the package manifests", () => {
    const manifest = JSON.parse(source("package.json")) as { license?: string };

    expect(manifest.license).toBe("SEE LICENSE IN LICENSE.md");
    for (const path of walkFiles(join(REPO_ROOT, "ee"), (file) => file.endsWith("package.json")))
      expect((JSON.parse(readFileSync(path, "utf8")) as { license?: string }).license).toBe(
        "LicenseRef-customermates-commercial",
      );
  });

  it("states the licence in the README in the four-line shape", () => {
    const readme = source("README.md");
    const section = readme.slice(readme.indexOf("## 📄 License"));

    expect(section).toContain("source-available and fair-code");
    expect(section).toContain("[Sustainable Use License](./LICENSE.md)");
    expect(section).toContain("[Customermates Enterprise License](./ee/LICENSE.md)");
    expect(section).toContain("- Source available:");
    expect(section).toContain("- Self-hostable:");
    expect(section).toContain("Enterprise licences are available");
    expect(section).toContain("[`LICENSING.md`](./LICENSING.md)");
    expect(readme).not.toMatch(/AGPL/);
    expect(readme).not.toMatch(/open[- ]source CRM/i);
  });

  it("has the notice, trademark, contributor and ownership files", () => {
    const notice = source("NOTICE");
    const trademark = source("TRADEMARK.md");
    const cla = source(".github/CLA.md");
    const contributing = source(".github/CONTRIBUTING.md");
    const owners = source(".github/CODEOWNERS");

    expect(notice).toContain("Sustainable Use License");
    expect(notice).toContain("THIRD_PARTY_LICENSES.md");
    expect(trademark).toContain("Any use of the licensor’s trademarks is subject to applicable law.");
    expect(trademark).toContain("## No white-labelling without an enterprise agreement");
    expect(trademark).toContain("## Forks must rename and drop the logo");
    expect(trademark).toContain("## Fair use of the name");
    expect(cla).toContain("permission to license my contributions on any terms they like");
    expect(cla).toContain("As far as the law allows, my contributions come as is");
    expect(contributing).toContain("## Contributor License Agreement");
    expect(contributing).toContain("## Community PR Guidelines");
    expect(contributing).toContain("Outside patches to `ee/` are accepted only under Section 2 of `ee/LICENSE.md`");
    for (const path of ["/ee/", "/LICENSE.md", "/LICENSING.md", "/core/commercial/", "/app/api/webhooks/lemonsqueezy/"])
      expect(owners).toContain(`${path} `);
  });

  it("gates the image publish on the third-party licence check and attaches the generated file to the release", () => {
    const workflow = source(".github/workflows/docker-publish.yml");
    const manifest = JSON.parse(source("package.json")) as { scripts: Record<string, string> };

    expect(workflow).toContain("node scripts/licenses/third-party-licenses.mjs --check");
    expect(workflow).toMatch(/build:\n {4}name: build \(\$\{\{ matrix\.platform \}\}\)\n {4}needs: licenses\n/);
    expect(workflow).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).toContain("gh release upload");
    expect(manifest.scripts["licenses:check"]).toBe("node scripts/licenses/third-party-licenses.mjs --check");
    expect(manifest.scripts["licenses:generate"]).toBe("node scripts/licenses/third-party-licenses.mjs");
    expect(existsSync(join(REPO_ROOT, "THIRD_PARTY_LICENSES.md"))).toBe(true);
  });

  it("binds the CLA check to the pull request and comment events with a pinned action and a signatures branch", () => {
    const workflow = source(".github/workflows/cla-check.yml");

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toContain("issue_comment:");
    expect(workflow).toContain("github.event.comment.body == 'recheck'");
    expect(workflow).toContain("path-to-document: https://github.com/customermates/customermates/blob/main/.github/CLA.md");
    expect(workflow).toContain("branch: cla-signatures");
    expect(workflow).toMatch(/uses: contributor-assistant\/github-action@[0-9a-f]{40} #/);
  });
});
