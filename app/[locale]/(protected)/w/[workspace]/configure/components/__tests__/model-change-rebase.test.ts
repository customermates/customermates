import { describe, expect, it } from "vitest";
import { rebaseModelChangeDraft } from "../model-change-rebase";

describe("configuration draft rebase", () => {
  it("adopts remote untouched controls while retaining local edits", () => {
    const saved = { name: "Old", description: "Before", columns: ["a", "b"] };
    const draft = { ...saved, name: "Mine" };
    const latest = { ...saved, description: "Remote", columns: ["b", "a"] };
    expect(rebaseModelChangeDraft(saved, draft, latest)).toEqual({
      form: { name: "Mine", description: "Remote", columns: ["b", "a"] },
      savedState: latest,
      conflicts: [],
    });
  });
  it("requires a choice for divergent same-control edits", () => {
    const saved = { name: "Old", columns: ["a"] };
    const draft = { name: "Mine", columns: ["a", "b"] };
    const latest = { name: "Theirs", columns: ["a", "c"] };
    const result = rebaseModelChangeDraft(saved, draft, latest);
    expect(result.form).toEqual(draft);
    expect(result.savedState).toEqual(latest);
    expect(result.conflicts).toEqual(["name", "columns"]);
    expect(result.form.columns).not.toBe(draft.columns);
  });
  it("does not flag matching concurrent edits", () => {
    expect(rebaseModelChangeDraft({ name: "Old" }, { name: "New" }, { name: "New" }).conflicts).toEqual([]);
  });
});
