import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findAgentUiTarget } from "@/ee/agent-chat/ui-targets";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

type DashboardMessages = {
  addCard: string;
  widgetKinds: { chart: string; activityTimeline: string };
  widgetEditor: { create: string };
};

const dashboardMessages = (locale: string) =>
  JSON.parse(read(`i18n/locales/${locale}.json`)).Dashboard as DashboardMessages;

describe("dialog targets in the assistant documentation", () => {
  it("keeps the widget kind cards a highlight target", () => {
    expect(findAgentUiTarget("widget-modal-kind")).not.toBeNull();
  });

  it.each(CONTENT_LOCALES)("names the widget kind cards among the dialog targets in %s", (locale) => {
    const messages = dashboardMessages(locale);
    const paragraph = read(`content/docs/${locale}/app-assistant.mdx`)
      .split("\n\n")
      .find(
        (block) =>
          block.includes(`**${messages.widgetKinds.chart}**`) &&
          block.includes(`**${messages.widgetKinds.activityTimeline}**`),
      );

    expect(paragraph).toBeDefined();
    expect(paragraph).toContain(`**${messages.addCard}**`);
    expect(paragraph).toContain(`**${messages.widgetEditor.create}**`);
  });
});
