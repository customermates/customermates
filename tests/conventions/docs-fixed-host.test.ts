import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

/**
 * The documentation never names a fixed Customermates address: app pages are relative routes and
 * the MCP endpoint is `<BASE_URL>/api/v1/mcp`, so every self-hosted instance serves correct docs.
 * Links are percent-decoded first, because a host inside a query parameter such as
 * `connectorUrl=https%3A%2F%2Fcustomermates.com` is still a fixed address.
 *
 * Two quotations of fixed addresses stay allowed: the product's own rate-limit message, quoted
 * word for word, and the public demo the docs index embeds. A mail address is not a host.
 */
const FIXED_HOST = /(?<![@\w.-])(?:[a-z0-9-]+\.)*customermates\.com(?![\w-])/i;

const ALLOWED = [
  { file: /messaging-rate-limits\.mdx$/, address: "https://customermates.com/docs/messaging-rate-limits" },
  { file: /intro-page\.mdx$/, address: "https://demo.customermates.com/" },
];

function decoded(line: string): string {
  return line.replace(/%[0-9a-f]{2}/gi, (escape) => {
    try {
      return decodeURIComponent(escape);
    } catch {
      return escape;
    }
  });
}

export function fixedHostViolations(sources: { file: string; text: string }[]) {
  const found: string[] = [];

  for (const { file, text } of sources) {
    const allowed = ALLOWED.filter((entry) => entry.file.test(file)).map((entry) => entry.address);

    text.split("\n").forEach((line, index) => {
      const rest = allowed.reduce((remaining, address) => remaining.split(address).join(""), decoded(line));
      if (FIXED_HOST.test(rest)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  }

  return found;
}

function docFiles() {
  return walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx"));
}

describe("documentation addresses", () => {
  it("names no fixed customermates.com address in the documentation", () => {
    const violations = fixedHostViolations(
      docFiles().map((file) => ({ file: relative(REPO_ROOT, file), text: readFileSync(file, "utf8") })),
    );

    const hint = "Write an app page as its relative route and the MCP endpoint as <BASE_URL>/api/v1/mcp";

    expect(violations, `${hint}:\n${violations.join("\n")}`).toEqual([]);
  });

  it("still reads the corpus it is meant to guard", () => {
    expect(docFiles().length).toBeGreaterThan(20);
  });

  it("finds a fixed host in link text, in an encoded query parameter and on a subdomain", () => {
    const linkText = "Sign up at [customermates.com/auth/signup](/auth/signup).";
    const encoded = "[Add to Claude](https://claude.ai/?connectorUrl=https%3A%2F%2Fcustomermates.com%2Fapi%2Fv1%2Fmcp)";
    const subdomain = "Open https://demo.customermates.com/en/dashboard.";

    expect(fixedHostViolations([{ file: "a.mdx", text: linkText }])).toHaveLength(1);
    expect(fixedHostViolations([{ file: "b.mdx", text: encoded }])).toHaveLength(1);
    expect(fixedHostViolations([{ file: "c.mdx", text: subdomain }])).toHaveLength(1);
  });

  it("leaves relative routes, <BASE_URL>, mail addresses and the two quotations alone", () => {
    expect(
      fixedHostViolations([
        { file: "a.mdx", text: "Sign up at [`/auth/signup`](/auth/signup), or paste `<BASE_URL>/api/v1/mcp`." },
        { file: "b.mdx", text: "Write to `mail@customermates.com`." },
        {
          file: "content/docs/en/messaging-rate-limits.mdx",
          text: "> Learn more at https://customermates.com/docs/messaging-rate-limits.",
        },
        {
          file: "content/docs/en/intro-page.mdx",
          text: "  src: https://demo.customermates.com/en/dashboard?agentChat=closed",
        },
      ]),
    ).toEqual([]);
  });
});
