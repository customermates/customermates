import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
vi.mock("../../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { TypeModalStore } from "../type-modal";
const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn() } as unknown as RootStore;

describe("list configuration", () => {
  it("preserves channel binding identity, naming hints, and avatar setting on disable", () => {
    const model = createCrmPreset(company, "EUR");
    model.capabilities = model.capabilities.filter((binding) => binding.kind !== "channels");
    const binding = {
      id: id("identity"),
      typeId: id("contact"),
      kind: "channels" as const,
      enabled: true,
      providerAvatar: true,
      fields: [{ role: "firstName", fieldId: id("contact.firstName") }],
    };
    model.capabilities.push(binding);
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, recordInvariant(model.types.find((type) => type.id === id("contact"))));
    store.onChange("channelsEnabled", false);
    const operation = store.operations().find((operation) => operation.operation === "putCapability");
    expect(operation?.operation === "putCapability" && operation.capability).toEqual({ ...binding, enabled: false });
  });
  it("does not rewrite channel configuration when appearance alone changes", () => {
    const model = createCrmPreset(company, "EUR");
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, model.types[0], "appearance");
    store.onChange("layout", "board");
    expect(store.section).toBe("appearance");
    expect(store.operations().map((operation) => operation.operation)).toEqual(["putType"]);
  });
  it("creates enabled channels atomically and uses one stable id across preview and apply", () => {
    const model = createCrmPreset(company, "EUR");
    const store = new TypeModalStore(root, model, vi.fn());
    store.edit(model, null);
    store.onChange("name", "Applicants");
    store.onChange("channelsEnabled", true);
    const first = store.operations();
    const second = store.operations();
    expect(first).toEqual(second);
    expect(first.map((operation) => operation.operation)).toEqual(["createType", "putCapability"]);
    const channels = first[1];
    expect(channels.operation === "putCapability" && channels.capability.typeId).toBe("$type");
  });
});
