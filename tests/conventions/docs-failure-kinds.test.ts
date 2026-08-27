import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { InteractorFailureKindSchema } from "@/core/validation/validation.utils";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

describe("documented failure kinds", () => {
  it("documents every failure kind the MCP surface can return, in every locale", () => {
    const kinds = InteractorFailureKindSchema.options;
    const missing: string[] = [];
    for (const locale of CONTENT_LOCALES) {
      const text = readFileSync(join(REPO_ROOT, "content", "docs", locale, "mcp.mdx"), "utf8");
      for (const kind of kinds) if (!text.includes(`\`${kind}\``)) missing.push(`${locale}: ${kind}`);
    }
    expect(missing, "a failure kind clients can receive is undocumented; agents cannot branch on what they cannot read").toEqual(
      [],
    );
  });
});
