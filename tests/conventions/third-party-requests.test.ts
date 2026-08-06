import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "core", "features", "ee"];

// lmsqueezy.com serves the affiliate attribution script loaded in the root layout of managed
// hosted deployments. It is a deliberate third-party request disclosed in the privacy policy,
// so it is allowed here knowingly rather than overlooked. Independent self-hosted deployments
// must not load it.
const ALLOWED_SUBRESOURCE_HOSTS = new Set(["demo.customermates.com", "lmsqueezy.com"]);

const SUBRESOURCE_PATTERN = /(?:\bsrc|\bsrcSet)=\{?["'`]([^"'`]*?)["'`]/g;

function sourceFiles(): string[] {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(
      join(REPO_ROOT, directory),
      (path) => /\.(ts|tsx)$/.test(path) && !path.includes("__tests__") && !/\.test\.tsx?$/.test(path),
    ),
  );
}

function externalHostsIn(text: string): string[] {
  const hosts: string[] = [];
  for (const match of text.matchAll(SUBRESOURCE_PATTERN)) {
    const value = match[1];
    if (!/^https?:\/\//.test(value)) continue;
    try {
      hosts.push(new URL(value).host);
    } catch {
      hosts.push(value);
    }
  }
  return hosts;
}

function countryCodes(): string[] {
  const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const block = /enum CountryCode \{([\s\S]*?)\n\}/.exec(schema);
  if (!block) throw new Error("CountryCode enum not found in prisma/schema.prisma");
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

describe("third-party browser requests", () => {
  it("loads only the disclosed affiliate tracker and excludes it from self-hosting", () => {
    const layout = readFileSync(join(REPO_ROOT, "app", "layout.tsx"), "utf8");
    const hosts = [...new Set(externalHostsIn(layout))];
    const hostedOnlyBlock = /env\.APP_MODE !== "self-hosted" && \(\s*<>([\s\S]*?)<\/\>\s*\)/.exec(layout)?.[1];

    expect(hosts).toEqual(["lmsqueezy.com"]);
    expect(hostedOnlyBlock).toContain("lemon-squeezy-affiliate-config");
    expect(hostedOnlyBlock).toContain("https://lmsqueezy.com/affiliate.js");
  });

  it("loads no third-party subresource outside the allowlist", () => {
    const violations: string[] = [];

    for (const path of sourceFiles()) {
      for (const host of externalHostsIn(readFileSync(path, "utf8"))) {
        if (ALLOWED_SUBRESOURCE_HOSTS.has(host)) continue;
        violations.push(`${relative(REPO_ROOT, path)}: ${host}`);
      }
    }

    expect(violations, `third-party subresources:\n${violations.join("\n")}`).toEqual([]);
  });

  it("serves footer badges from bundled assets while keeping their outbound links", () => {
    const source = readFileSync(join(REPO_ROOT, "app", "components", "footer-badges.tsx"), "utf8");
    const images = [...source.matchAll(/(?:light|dark):\s*"([^"]+)"/g)].map((match) => match[1]);
    const links = [...source.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]);

    expect(images.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);

    for (const image of images) {
      expect(image.startsWith("/images/badges/"), `badge image is not bundled: ${image}`).toBe(true);
      expect(existsSync(join(REPO_ROOT, "public", image)), `missing badge asset: ${image}`).toBe(true);
    }

    for (const link of links) expect(link.startsWith("https://"), `badge link is not absolute: ${link}`).toBe(true);
  });

  it("bundles a flag for every country code", () => {
    const missing = countryCodes().filter(
      (code) => !existsSync(join(REPO_ROOT, "public", "icons", "flags", "w40", `${code.toLowerCase()}.png`)),
    );

    expect(missing, `missing bundled flags:\n${missing.join("\n")}`).toEqual([]);
  });
});
