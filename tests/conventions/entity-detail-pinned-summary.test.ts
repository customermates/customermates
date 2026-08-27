import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const summaries = ["contacts", "organizations", "deals", "services", "tasks"] as const;

function readSummary(entity: (typeof summaries)[number]): string {
  const singular = entity.slice(0, -1);
  return readFileSync(
    join(REPO_ROOT, `app/[locale]/(protected)/${entity}/components/${singular}-detail-summary.tsx`),
    "utf8",
  );
}

describe("entity detail pinned summaries", () => {
  it.each(summaries)("shows pinned %s timestamps relatively without changing the form fields", (entity) => {
    const source = readSummary(entity);

    expect(source).toContain("formatRelativeTime(fetchedEntity.createdAt)");
    expect(source).toContain("formatRelativeTime(fetchedEntity.updatedAt)");
    expect(source).not.toContain("formatNumericalShortDateTime(fetchedEntity.createdAt)");
    expect(source).not.toContain("formatNumericalShortDateTime(fetchedEntity.updatedAt)");
  });

  it.each(summaries)("uses the interactive assignee summary on %s", (entity) => {
    const source = readSummary(entity);

    expect(source).toContain("<EntityDetailAvatarSummaryValue");
    expect(source).toContain("items={users}");
    expect(source).toContain("userModalStore.loadById(item.id)");
  });

  it("keeps pinned contact channels actionable", () => {
    const source = readSummary("contacts");

    expect(source).toContain("<ChannelIconStack");
    expect(source).toContain("onItemClick={(item) =>");
    expect(source).toMatch(/channelDisplayLabel\(\s*item\.provider,\s*item\.value,\s*item\.profileUrl\s*\)/s);
  });
});
