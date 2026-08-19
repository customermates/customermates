import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);
const INLINE_CODE_SPAN = /`[^`]*`/g;
const MDX_HOSTILE = /[{}<]/;

type Operation = { summary?: unknown; description?: unknown };

function operationProse(): { location: string; text: string }[] {
  const spec = generateOpenApiSpec() as { paths?: Record<string, Record<string, unknown>> };
  const prose: { location: string; text: string }[] = [];
  for (const [path, entry] of Object.entries(spec.paths ?? {})) {
    for (const [verb, operation] of Object.entries(entry)) {
      if (!HTTP_VERBS.has(verb)) continue;
      const { summary, description } = operation as Operation;
      for (const [field, text] of [
        ["summary", summary],
        ["description", description],
      ] as const) {
        if (typeof text === "string") prose.push({ location: `${verb} ${path} :: ${field}`, text });
      }
    }
  }
  return prose;
}

describe("openapi mdx safe descriptions", () => {
  it("keeps operation summaries and descriptions free of unfenced MDX expression syntax", () => {
    const violations = operationProse()
      .filter(({ text }) => MDX_HOSTILE.test(text.replace(INLINE_CODE_SPAN, "")))
      .map(({ location, text }) => `${location} must fence MDX expression syntax in backticks: ${text}`);
    expect(violations).toEqual([]);
  });

  it("reads at least one operation so the walk cannot pass vacuously", () => {
    expect(operationProse().length).toBeGreaterThan(0);
  });

  it("still rejects expression syntax that is not fenced", () => {
    const unfenced = "uses the { identifier } object form";
    expect(MDX_HOSTILE.test(unfenced.replace(INLINE_CODE_SPAN, ""))).toBe(true);
    expect(MDX_HOSTILE.test("uses the `{ identifier }` object form".replace(INLINE_CODE_SPAN, ""))).toBe(false);
  });
});
