import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordEditorContext, RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({ mutateRecordAction: vi.fn(), getRecordEditorAction: vi.fn() }));
vi.mock("../../../actions", () => mocks);

import { RecordEditorStore } from "../record-editor.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId, "EUR");
const root = {
  userStore: { user: { id: randomUUID() } },
  companyStore: { company: { currency: "EUR" } },
} as unknown as RootStore;
const context = (type: string): RecordEditorContext => ({
  model,
  typeId: id(type),
  permittedActions: ["create", "readAll", "update", "delete"],
  canManageSchema: true,
});
const record = (version = 1): RecordDto => ({
  ref: { typeId: id("deal"), recordId: "11111111-1111-4111-8111-111111111111" },
  version,
  schemaRevision: 1,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
  fields: [{ fieldId: id("deal.name"), result: { state: "value", value: { kind: "text", value: `Deal ${version}` } } }],
  assignedUserIds: [],
  assignedUsers: [],
  relationships: [],
});

beforeEach(() => vi.resetAllMocks());

describe("record editor persistence", () => {
  it("keeps identity channels in the form draft and submits only intentional channel changes", async () => {
    const store = new RecordEditorStore(root, context("contact"), vi.fn());
    const person: RecordDto = {
      ...record(),
      ref: { typeId: id("contact"), recordId: randomUUID() },
      identities: [
        {
          id: randomUUID(),
          provider: "mail",
          channelClass: "email",
          value: "person@example.test",
          messagingId: null,
          displayName: null,
          profileUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    store.edit(context("contact"), person);
    store.onChange(`values.${id("contact.firstName")}`, "Person");
    mocks.mutateRecordAction.mockRejectedValue(new Error("Connection closed"));
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    expect(mocks.mutateRecordAction.mock.calls[0][0].mutation).not.toHaveProperty("identities");
    store.onChange("identities", []);
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    expect(mocks.mutateRecordAction.mock.calls[1][0].mutation.identities).toEqual([]);
    store.resetForm();
    expect(store.form.identities[0]?.value).toBe("person@example.test");
    expect(store.hasUnsavedChanges).toBe(false);
  });
  it("leaves a deleted page after publication without reading the removed record", async () => {
    const saved = vi.fn();
    const deleted = vi.fn();
    const store = new RecordEditorStore(root, context("deal"), saved, true, deleted);
    store.edit(context("deal"), record());
    store.setPendingOperation(randomUUID(), true);
    expect(store.isReadOnly).toBe(true);
    await store.operationCompleted();
    expect(deleted).toHaveBeenCalledOnce();
    expect(saved).not.toHaveBeenCalled();
    expect(mocks.getRecordEditorAction).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(false);
    expect(store.pendingOperationId).toBeNull();
  });

  it("retries an uncertain write with the same key and rotates it when the draft changes", async () => {
    const store = new RecordEditorStore(root, context("lineItem"), vi.fn());
    const parent = record();
    store.edit(context("lineItem"), null, {
      relationId: id("lineItem.deal"),
      record: parent.ref,
      title: { state: "missing" },
    });
    const service = { typeId: id("service"), recordId: randomUUID() };
    store.stageLink(
      { action: "link", direction: "outgoing", relationId: id("lineItem.service"), record: service },
      { state: "missing" },
    );
    mocks.mutateRecordAction.mockRejectedValue(new Error("Connection closed after commit"));
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    const first = mocks.mutateRecordAction.mock.calls[0][0];
    expect(first).toEqual(mocks.mutateRecordAction.mock.calls[1][0]);
    expect(first.mutation.links).toEqual([
      { relationId: id("lineItem.deal"), direction: "outgoing", record: parent.ref },
      { relationId: id("lineItem.service"), direction: "outgoing", record: service },
    ]);
    expect(first.mutation).not.toHaveProperty("assignedUserIds");
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(store.isLoading).toBe(false);
    expect(store.isOpen).toBe(true);
    store.onChange(`values.${id("lineItem.quantity")}`, "3");
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    expect(mocks.mutateRecordAction.mock.calls[2][0].idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("keeps edits made while a nested mutation refresh is in flight", async () => {
    const saved = vi.fn();
    const store = new RecordEditorStore(root, context("deal"), saved);
    store.edit(context("deal"), record());
    const response = Promise.withResolvers<{ ok: true; data: RecordEditorResult }>();
    mocks.getRecordEditorAction.mockReturnValue(response.promise);
    const refresh = store.reloadAfterNestedChange();
    store.onChange(`values.${id("deal.name")}`, "Unsaved draft");
    response.resolve({ ok: true, data: { ...context("deal"), record: record(2) } });
    await refresh;
    expect(store.form.values[id("deal.name")]).toBe("Unsaved draft");
    expect(store.record?.version).toBe(1);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    expect(store.relatedRevision).toBe(0);
  });

  it("invalidates related choices after a confirmed nested change", async () => {
    const saved = vi.fn();
    const store = new RecordEditorStore(root, context("deal"), saved);
    store.edit(context("deal"), record());
    mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: { ...context("deal"), record: record(2) } });
    await store.reloadAfterNestedChange();
    expect(store.record?.version).toBe(2);
    expect(store.relatedRevision).toBe(1);
    expect(saved).toHaveBeenCalledOnce();
  });

  it("blocks another page save until the confirmed write's latest version can be loaded", async () => {
    const store = new RecordEditorStore(root, context("deal"), vi.fn(), true);
    store.edit(context("deal"), record());
    store.onChange(`values.${id("deal.name")}`, "Saved change");
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [record().ref], schemaRevision: 1 },
    });
    mocks.getRecordEditorAction.mockRejectedValueOnce(new Error("Read unavailable"));
    await expect(store.onSubmit()).rejects.toThrow("Read unavailable");
    expect(store.isOpen).toBe(true);
    expect(store.isReadOnly).toBe(true);
    expect(store.refreshRequired).toBe(true);
    await store.onSubmit();
    expect(mocks.mutateRecordAction).toHaveBeenCalledTimes(1);
    mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: { ...context("deal"), record: record(2) } });
    await store.refreshRecord();
    expect(store.record?.version).toBe(2);
    expect(store.refreshRequired).toBe(false);
    expect(store.isReadOnly).toBe(false);
    store.onChange(`values.${id("deal.name")}`, "Next change");
    await store.onSubmit();
    expect(mocks.mutateRecordAction.mock.calls[1][0].mutation.expectedVersion).toBe(2);
    expect(mocks.mutateRecordAction.mock.calls[1][0].idempotencyKey).not.toBe(
      mocks.mutateRecordAction.mock.calls[0][0].idempotencyKey,
    );
  });
});
