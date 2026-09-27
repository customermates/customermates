import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const composer = readFileSync(
  join(process.cwd(), "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"),
  "utf8",
);

describe("thread reply composer recipient fields", () => {
  it.each([
    ["recipients", "to", "Inbox.compose.toLabel"],
    ["cc", "cc", "Inbox.compose.ccLabel"],
    ["bcc", "bcc", "Inbox.compose.bccLabel"],
  ])("names the %s chip input by its visible row label", (fieldId, labelSuffix, labelKey) => {
    const labelId = "{`${recipientLabelId}-" + labelSuffix + "`}";
    const labelAt = composer.indexOf(`id=${labelId}`);
    const fieldAt = composer.indexOf(`id="${fieldId}"`);
    const field = composer.slice(composer.lastIndexOf("<FormInputChips", fieldAt), composer.indexOf("/>", fieldAt));

    expect(labelAt).toBeGreaterThan(-1);
    expect(composer.indexOf(`t("${labelKey}")`, labelAt)).toBeGreaterThan(labelAt);
    expect(field).toContain(`ariaLabelledBy=${labelId}`);
  });
});
