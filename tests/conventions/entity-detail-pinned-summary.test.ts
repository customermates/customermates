import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./walk";
const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const summary = read("app/[locale]/(protected)/records/[typeId]/components/record-detail-summary.tsx");
describe("generic record detail pinned summaries", () => {
  it("uses the same metadata columns for built-in and customer-created types", () => {
    expect(summary).toContain("recordColumns(store.presentation.typeId, store.presentation.model)");
    expect(summary).toContain("starredFieldIds.flatMap");
    expect(summary).toContain("store.previewValue(column.field)");
    expect(summary).not.toMatch(/entityType ===|type.name ===/);
  });
  it("shows pinned timestamps through the shared relative-time renderer", () => {
    expect(summary).toContain("<RecordCell");
    const cell = read("app/[locale]/(protected)/records/[typeId]/components/record-cell.tsx");
    expect(cell).toContain("formatRelativeTime");
  });
  it("keeps assignees and identity channels actionable", () => {
    expect(summary).toContain("<EntityDetailAvatarSummaryValue");
    expect(summary).toContain("userModalStore.loadById(item.id)");
    expect(summary).toContain("<ChannelIconStack");
    expect(summary).toContain("channelDisplayLabel(entry.provider, entry.value, entry.profileUrl)");
  });
});
