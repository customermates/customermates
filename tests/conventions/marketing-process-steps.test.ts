import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Step, Steps } from "@/components/marketing/process-steps";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const PILOT_STEP_COUNTS = {
  "email-integration.mdx": 4,
  "pipeline.mdx": 3,
} as const;

describe("marketing process steps", () => {
  it("registers one semantic ordered-list primitive for authored MDX", () => {
    const registry = readFileSync(
      join(REPO_ROOT, "core", "fumadocs", "mdx-components.tsx"),
      "utf8",
    );
    const markup = renderToStaticMarkup(
      createElement(
        Steps,
        { "aria-label": "Connection" },
        createElement(
          Step,
          { title: "Choose a provider" },
          createElement("p", null, "Connect once."),
        ),
        createElement(
          Step,
          { title: "Review the inbox" },
          createElement("p", null, "Check the result."),
        ),
      ),
    );

    expect(registry).toContain(
      'import { Step, Steps } from "@/components/marketing/process-steps";',
    );
    expect(registry).toMatch(/\n\s+Step,\n\s+Steps,/u);
    expect(markup).toContain("<ol");
    expect(markup.match(/<li\b/gu)).toHaveLength(2);
    expect(markup).toContain("fd-steps");
    expect(markup.match(/fd-step/gu)).toHaveLength(3);
    expect(markup).toContain("before:content-[counter(step)]");
    expect(markup).toContain("before:-start-10");
    expect(markup).toContain("sm:before:-start-11");
    expect(markup).toContain("ps-1");
    expect(markup).not.toMatch(/class="[^"]*\bp-0\b/u);
    expect(markup).toContain('data-process-steps="true"');
    expect(markup.match(/data-process-step="true"/gu)).toHaveLength(2);
  });

  it("uses the rail only for genuine ordered workflows on both localized pilot pages", () => {
    for (const locale of CONTENT_LOCALES) {
      for (const [filename, expectedSteps] of Object.entries(
        PILOT_STEP_COUNTS,
      )) {
        const source = readFileSync(
          join(REPO_ROOT, "content", "feature-pages", locale, filename),
          "utf8",
        );

        expect(source.match(/<Steps>/gu)).toHaveLength(1);
        expect(source.match(/<Step\s/gu)).toHaveLength(expectedSteps);
        expect(source.match(/<\/Step>/gu)).toHaveLength(expectedSteps);
        expect(source.match(/<\/Steps>/gu)).toHaveLength(1);
      }
    }
  });

  it("documents S-08 as the same one-column vertical rail at every width", () => {
    const patterns = readFileSync(
      join(
        REPO_ROOT,
        "app",
        "[locale]",
        "(static)",
        "styleguide",
        "components",
        "section-patterns.tsx",
      ),
      "utf8",
    );
    const responsive = readFileSync(
      join(
        REPO_ROOT,
        "app",
        "[locale]",
        "(static)",
        "styleguide",
        "components",
        "responsive-contract.tsx",
      ),
      "utf8",
    );

    expect(patterns).toContain('columns="One vertical rail at every width"');
    expect(patterns).toContain("<Steps");
    expect(patterns).toContain("<Step");
    expect(responsive).toContain('rule: "one vertical rail at every width"');
    expect(responsive).not.toContain(
      'pattern: "S-08 Numbered sequence", rule: "12 → 4 / 4 / 4"',
    );
  });
});
