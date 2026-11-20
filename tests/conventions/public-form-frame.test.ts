import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PUBLIC_FORM_FRAME_POLICY, PUBLIC_FORM_FRAME_SOURCE } from "@/core/config/public-form-frame";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, readSourceText, walkFiles } from "./walk";

const GENERIC_SOURCE = '"/:path((?!api/v1/files/[^/]+/content$).*)"';
const TOKEN = "a".repeat(64);
const frame = new RegExp(`^${PUBLIC_FORM_FRAME_SOURCE.replace(/:[a-zA-Z]+/gu, "[^/]+")}$`, "u");

describe("public form frame policy", () => {
  it("is a plain locale and token route pattern with no wildcard or optional segment", () => {
    expect(PUBLIC_FORM_FRAME_SOURCE).toMatch(/^(\/(:[a-zA-Z]+|f))+$/u);
    expect(PUBLIC_FORM_FRAME_SOURCE.split("/").slice(1)).toEqual([":locale", "f", ":token"]);
  });

  it.each(ROUTING_LOCALES)("lets any page embed the form route in the %s locale", (locale) => {
    expect(frame.test(`/${locale}/f/${TOKEN}`)).toBe(true);
  });

  it.each([
    "/en/f",
    "/en/f/",
    `/en/f/${TOKEN}/extra`,
    "/en/leads",
    `/api/hooks/${TOKEN}`,
    `/api/v1/forms/read`,
    `/en/v/${TOKEN}`,
    `/f/${TOKEN}/x`,
  ])("does not open %s to framing", (path) => {
    expect(frame.test(path)).toBe(false);
  });

  it("keeps the generic header rule unchanged and puts the form rule after it so the form rule wins", () => {
    const config = readSourceText(`${REPO_ROOT}/next.config.ts`);
    const generic = config.indexOf(`source: ${GENERIC_SOURCE}`);
    const form = config.indexOf("source: PUBLIC_FORM_FRAME_SOURCE");

    expect(generic).toBeGreaterThan(0);
    expect(form).toBeGreaterThan(generic);
    expect(config).toContain('{ key: "Content-Security-Policy", value: PUBLIC_FORM_FRAME_POLICY }');
    expect(config.match(/PUBLIC_FORM_FRAME_SOURCE/gu)).toHaveLength(2);
  });

  it("keeps the wildcard frame-ancestors literal in its one file", () => {
    const sources = walkFiles(
      REPO_ROOT,
      (path) => /\.(ts|tsx|mjs|js)$/u.test(path) && !/(\.test\.|__tests__|\/tests\/|\/e2e\/)/u.test(path),
    ).filter((path) => readSourceText(path).includes("frame-ancestors *"));

    expect(sources.map((path) => relative(REPO_ROOT, path))).toEqual(["core/config/public-form-frame.ts"]);
    expect(PUBLIC_FORM_FRAME_POLICY).toBe("frame-ancestors *");
  });
});
