import type { RootStore } from "@/core/stores/root.store";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { RecordFieldValueStore } from "../record-field-value-editor";

const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;

function field(valueType: RecordFieldView["valueType"]): RecordFieldView {
  return {
    id: "2b9d6f0e-4c1a-4d3b-8e7f-5a6b7c8d9e01",
    typeId: "6c3e1a2b-9d8f-4e7a-b6c5-d4e3f2a1b0c9",
    label: "Website",
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
  };
}

describe("inline record field validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["url", "not a url", "Common.errors.invalidUrl"],
    ["email", "still-not-an-email", "Common.errors.invalidEmail"],
  ] as const)("shows one toast for an invalid %s value and keeps it unsaved", async (valueType, value, message) => {
    const save = vi.fn();
    const done = vi.fn();
    const store = new RecordFieldValueStore(rootStore, field(valueType), undefined, save, done);
    store.onChange("value", value);

    await store.apply(false);

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(message);
    expect(store.getError("value")).toEqual([message]);
    expect(save).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it("shows one toast for a value the server rejects", async () => {
    const save = vi.fn().mockResolvedValue({ saved: false, invalid: ["Enter a valid URL."] });
    const done = vi.fn();
    const store = new RecordFieldValueStore(rootStore, field("url"), undefined, save, done);
    store.onChange("value", "https://example.com");

    await store.apply(false);

    expect(save).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Enter a valid URL.");
    expect(store.getError("value")).toEqual(["Enter a valid URL."]);
    expect(done).not.toHaveBeenCalled();
  });
});
