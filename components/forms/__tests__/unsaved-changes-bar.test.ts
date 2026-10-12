import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { unsavedChangesMode } from "../unsaved-changes-bar";

describe("unsavedChangesMode", () => {
  it("shows nothing for a clean existing record", () => {
    expect(unsavedChangesMode({ dirty: false, editable: true })).toBe("none");
  });

  it("shows the unsaved-changes bar once an existing record is dirty", () => {
    expect(unsavedChangesMode({ dirty: true, editable: true })).toBe("bar");
  });

  it("keeps the visible footer for create forms whether or not they are dirty", () => {
    expect(unsavedChangesMode({ creating: true, dirty: false, editable: true })).toBe("footer");
    expect(unsavedChangesMode({ creating: true, dirty: true, editable: true })).toBe("footer");
  });

  it("shows nothing for read-only forms", () => {
    expect(unsavedChangesMode({ dirty: true, editable: false })).toBe("none");
    expect(unsavedChangesMode({ creating: true, dirty: true, editable: false })).toBe("none");
  });
});
