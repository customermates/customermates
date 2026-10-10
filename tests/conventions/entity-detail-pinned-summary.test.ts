import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./walk";
const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const summary = read("app/[locale]/(protected)/records/[typeId]/components/record-detail-chip-row.tsx");
describe("generic record detail pinned summaries", () => {
  it("uses the same metadata columns for built-in and customer-created types", () => {
    expect(summary).toContain("recordColumns(store.presentation.typeId, store.presentation.model)");
    expect(summary).toContain("starredFieldIds.flatMap");
    expect(summary).toContain("store.previewValue(field)");
    expect(summary).not.toMatch(/entityType ===|type.name ===/);
  });
  it("renders pinned values with the chip row shared with cards", () => {
    expect(summary).toContain("<RecordPropertyChipView");
    expect(summary).toContain("recordChipRowModel(pinned, row, { keepEmpty: true })");
  });
  it("keeps assignees and identity channels actionable", () => {
    const chips = read("app/[locale]/(protected)/records/[typeId]/components/record-chip-row.tsx");
    expect(summary).toContain("userModalStore.loadById(item.id)");
    expect(summary).toContain("<IdentityChips");
    expect(chips).toContain("channelDisplayLabel(identity.provider, identity.value, identity.profileUrl)");
    expect(chips).toContain("<ContactValue");
  });
});
