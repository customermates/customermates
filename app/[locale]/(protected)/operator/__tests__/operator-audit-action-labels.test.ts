import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `translated:${key}` }));

import { AuditActionLabel } from "../operator-value-labels";

import { OPERATOR_AUDIT_SOURCE } from "@/ee/operator/operator-lists.schema";
import { OPERATOR_AUDIT_ACTION } from "@/ee/operator/operator.schema";

const catalog = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", "en.json"), "utf8")) as {
  OperatorAudit: { values: { action: Record<string, string> } };
};

const entries = Object.entries(OPERATOR_AUDIT_ACTION);

describe("operator audit action labels", () => {
  it.each(entries)("renders a translated label for %s instead of the raw action code", (name, action) => {
    const html = renderToStaticMarkup(jsx(AuditActionLabel, { action, source: OPERATOR_AUDIT_SOURCE.operator }));

    expect(html).toBe(`translated:OperatorAudit.values.action.${name}`);
  });

  it("keeps the catalog aligned with the audited actions", () => {
    expect(Object.keys(catalog.OperatorAudit.values.action).sort()).toEqual(entries.map(([name]) => name).sort());
  });

  it("routes product rows through the shared domain-event catalog", () => {
    const html = renderToStaticMarkup(
      jsx(AuditActionLabel, { action: "task.created", source: OPERATOR_AUDIT_SOURCE.product }),
    );

    expect(html).toBe("translated:Common.events.task.created");
  });
});
