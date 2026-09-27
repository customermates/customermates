import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DOCS_HELDOUT, DOCS_HELDOUT_LIVE_SPECS } from "../classifier-eval/heldout/docs-heldout";
import { GUARD_HELDOUT, GUARD_HELDOUT_FAMILIES } from "../classifier-eval/heldout/guard-heldout";
import { ROUTING_HELDOUT } from "../classifier-eval/heldout/routing-heldout";

import { splitSections } from "@/features/mcp-tools/docs-retrieval";
import { getDocsPageRaw, listDocsSlugs } from "@/features/mcp-tools/docs.mcp-tools";

const HELDOUT_DIR = path.resolve(process.cwd(), "scripts/agent-benchmark/classifier-eval/heldout");

const FROZEN: Readonly<Record<string, string>> = {
  "guard-heldout.ts": "ce3aa6ca93369aea44509025b64e597db5f1e29a27f05d4415bf70276a727128",
  "routing-heldout.ts": "9a852d245f1680571101feb7123e708edb7d1b3e15b3b1ca11eb2609bc372b7f",
  "docs-heldout.ts": "8f3c2c0681fb5be7c6eb583f6c36297aedcb1ecd0e6c641c8ba66fb8e91631df",
};

const DOCS_QUESTION_DRAFT_SHA256 = "a3a64875bcfc86505f2357a73f8849202ed2e70630a8e99e6851033e5c50c119";

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

describe("frozen held-out fixtures", () => {
  it("match the sha256 recorded in the test and in PREREGISTRATION.md", () => {
    const preregistration = readFileSync(path.join(HELDOUT_DIR, "PREREGISTRATION.md"), "utf8");
    for (const [file, frozen] of Object.entries(FROZEN)) {
      expect(sha256(readFileSync(path.join(HELDOUT_DIR, file), "utf8")), file).toBe(frozen);
      expect(preregistration).toContain(`| \`${file}\` | \`${frozen}\` |`);
    }
  });

  it("keeps the docs questions identical to the blind draft", () => {
    const draft = `${DOCS_HELDOUT.map((item) => `${item.lang}|${item.query}`).join("\n")}\n`;

    expect(sha256(draft)).toBe(DOCS_QUESTION_DRAFT_SHA256);
  });
});

describe("guard held-out set", () => {
  it("labels every mention against real candidates", () => {
    expect(GUARD_HELDOUT).toHaveLength(153);
    expect(new Set(GUARD_HELDOUT.map((item) => item.id)).size).toBe(GUARD_HELDOUT.length);
    expect(new Set(GUARD_HELDOUT.map((item) => item.lang))).toEqual(
      new Set(["en", "de", "es", "fr", "it", "nl", "pl", "pt"]),
    );
    for (const item of GUARD_HELDOUT) {
      expect(item.mentions.length, item.id).toBeGreaterThan(0);
      for (const mention of item.mentions) {
        const candidates = GUARD_HELDOUT_FAMILIES[mention.family].candidates;

        expect(candidates.length).toBeGreaterThanOrEqual(2);
        expect(item.message.toLowerCase(), item.id).toContain(mention.span.toLowerCase());
        expect(
          mention.intended.every((name) => candidates.includes(name)),
          item.id,
        ).toBe(true);
        expect(mention.dangerousIfAllowed, item.id).toBe(mention.gold !== "allow");
        if (mention.form === "rule") expect(mention.rule, item.id).toBeTruthy();
        if (mention.form === "bulk") expect(mention.intended, item.id).toEqual(candidates);
      }
    }
  });
});

describe("routing held-out set", () => {
  it("gives every multi-round task a per-turn label whose union is the task label", () => {
    expect(ROUTING_HELDOUT).toHaveLength(60);
    expect(new Set(ROUTING_HELDOUT.map((item) => item.id)).size).toBe(60);
    expect(ROUTING_HELDOUT.filter((item) => item.lang !== "en")).toHaveLength(30);
    for (const item of ROUTING_HELDOUT) {
      if (item.set !== "multi-round") {
        expect(item.prompts, item.id).toHaveLength(1);
        continue;
      }
      expect(item.perTurn?.length, item.id).toBe(item.prompts.length);
      expect(new Set(item.perTurn?.flat())).toEqual(new Set(item.toolsets));
    }
  });
});

describe("docs held-out set", () => {
  it("points every question at sections that exist in its docs locale", () => {
    const anchorsByLocale = new Map(
      (["en", "de"] as const).map((locale) => [
        locale,
        new Set(
          listDocsSlugs(locale, "docs").flatMap((slug) => {
            const page = getDocsPageRaw(slug, locale, "docs")!;
            return splitSections({ slug, source: "docs", pageTitle: page.title, markdown: page.markdown }).map(
              (section) => `${section.slug}#${section.anchor}`,
            );
          }),
        ),
      ]),
    );

    expect(DOCS_HELDOUT).toHaveLength(40);
    for (const item of DOCS_HELDOUT) {
      const anchors = anchorsByLocale.get(item.docsLocale)!;

      expect(item.docsLocale, item.id).toBe(item.lang === "de" ? "de" : "en");
      expect(item.anchors[0].startsWith(`${item.slug}#`), item.id).toBe(true);
      expect([...item.anchors, ...item.alternatives].filter((anchor) => !anchors.has(anchor))).toEqual([]);
      expect(item.fact.length).toBeGreaterThan(0);
    }
  });

  it("derives 30 live case specs, six per language", () => {
    expect(DOCS_HELDOUT_LIVE_SPECS).toHaveLength(30);
    for (const lang of ["en", "de", "es", "fr", "it"]) {
      expect(DOCS_HELDOUT_LIVE_SPECS.filter((spec) => spec.lang === lang)).toHaveLength(6);
    }
  });
});
