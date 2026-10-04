import { randomUUID } from "node:crypto";
import { toJS } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordEditorContext, RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordEditorAction: vi.fn(),
}));
vi.mock("../../../actions", () => mocks);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

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
  fields: [
    {
      fieldId: id("deal.name"),
      result: {
        state: "value",
        value: { kind: "text", value: `Deal ${version}` },
      },
    },
  ],
  assignedUserIds: [],
  assignedUsers: [],
  relationships: [],
});

beforeEach(() => vi.resetAllMocks());

describe("record editor persistence", () => {
  it("does not claim a channel draft belonging to another editor of the same record", () => {
    const compose = { sourceContextKey: null as string | null, hasUnsavedChanges: true, isLoading: false };
    const sharedRoot = { ...root, threadComposeStore: compose } as unknown as RootStore;
    const first = new RecordEditorStore(sharedRoot, context("deal"), vi.fn());
    const second = new RecordEditorStore(sharedRoot, context("deal"), vi.fn());
    first.edit(context("deal"), record());
    second.edit(context("deal"), record());
    expect(first.sessionKey).toBe(second.sessionKey);
    expect(first.channelComposeKey).not.toBe(second.channelComposeKey);
    compose.sourceContextKey = first.channelComposeKey;
    expect(first.hasRelatedDraft).toBe(true);
    expect(second.hasRelatedDraft).toBe(false);
    const next = vi.fn();
    second.runAfterChannelDraft(next);
    expect(next).toHaveBeenCalledOnce();
    expect(compose.sourceContextKey).toBe(first.channelComposeKey);
  });

  it("guards channel-destroying layout and panel changes, and ignores stale discard confirmations", () => {
    let pending: (() => void) | undefined;
    let currentCompose = true;
    const compose = {
      sourceContextKey: null as string | null,
      hasUnsavedChanges: true,
      isLoading: false,
      captureContext: () => () => currentCompose,
      discardNewThread: vi.fn(),
    };
    const navigationGuard = { tryNavigate: vi.fn((callback: () => void) => (pending = callback)) };
    const store = new RecordEditorStore(
      { ...root, threadComposeStore: compose, navigationGuard } as unknown as RootStore,
      context("deal"),
      vi.fn(),
    );
    store.edit(context("deal"), record());
    compose.sourceContextKey = store.channelComposeKey;
    const next = vi.fn();
    store.runAfterChannelDraft(next);
    expect(next).not.toHaveBeenCalled();
    expect(compose.discardNewThread).not.toHaveBeenCalled();
    currentCompose = false;
    pending?.();
    expect(next).not.toHaveBeenCalled();
    currentCompose = true;
    store.runAfterChannelDraft(next);
    pending?.();
    expect(compose.discardNewThread).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    compose.isLoading = true;
    store.runAfterChannelDraft(next);
    expect(next).toHaveBeenCalledOnce();
  });
  it("retains an owned channel draft and its record session until refresh can safely retry", async () => {
    const compose = { sourceContextKey: null as string | null, hasUnsavedChanges: true, isLoading: false };
    const store = new RecordEditorStore(
      { ...root, threadComposeStore: compose } as unknown as RootStore,
      context("deal"),
      vi.fn(),
      true,
    );
    store.edit(context("deal"), record());
    compose.sourceContextKey = store.channelComposeKey;
    const session = store.sessionKey;
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.isReadOnly).toBe(true);
    await store.refreshRecord();
    expect(mocks.getRecordEditorAction).not.toHaveBeenCalled();
    expect(store.sessionKey).toBe(session);
    expect(store.refreshRequired).toBe(true);
    expect(store.staleChange).toBe(false);
    compose.hasUnsavedChanges = false;
    mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: { ...context("deal"), record: record(2) } });
    await store.refreshRecord();
    expect(store.record?.version).toBe(2);
    expect(store.refreshRequired).toBe(false);
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
  });

  it("does not apply a record read when its owned composer becomes dirty during the request", async () => {
    const compose = { sourceContextKey: null as string | null, hasUnsavedChanges: false, isLoading: false };
    const store = new RecordEditorStore(
      { ...root, threadComposeStore: compose } as unknown as RootStore,
      context("deal"),
      vi.fn(),
      true,
    );
    store.edit(context("deal"), record());
    compose.sourceContextKey = store.channelComposeKey;
    const session = store.sessionKey;
    let resolve!: (value: unknown) => void;
    mocks.getRecordEditorAction.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = store.refreshRecord();
    compose.hasUnsavedChanges = true;
    resolve({ ok: true, data: { ...context("deal"), record: record(2) } });
    await pending;
    expect(store.record?.version).toBe(1);
    expect(store.sessionKey).toBe(session);
    expect(store.refreshRequired).toBe(true);
  });

  it("does not block a record read with an unrelated compose source", async () => {
    const compose = { sourceContextKey: "unrelated", hasUnsavedChanges: true, isLoading: false };
    const store = new RecordEditorStore(
      { ...root, threadComposeStore: compose } as unknown as RootStore,
      context("deal"),
      vi.fn(),
      true,
    );
    store.edit(context("deal"), record());
    mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: { ...context("deal"), record: record(2) } });
    await store.refreshRecord();
    expect(store.record?.version).toBe(2);
    expect(store.isReadOnly).toBe(false);
  });
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
      {
        action: "link",
        direction: "outgoing",
        relationId: id("lineItem.service"),
        record: service,
      },
      { state: "missing" },
    );
    mocks.mutateRecordAction.mockRejectedValue(new Error("Connection closed after commit"));
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    await expect(store.onSubmit()).rejects.toThrow("Connection closed");
    const first = mocks.mutateRecordAction.mock.calls[0][0];
    expect(first).toEqual(mocks.mutateRecordAction.mock.calls[1][0]);
    expect(first.mutation.links).toEqual([
      {
        relationId: id("lineItem.deal"),
        direction: "outgoing",
        record: parent.ref,
      },
      {
        relationId: id("lineItem.service"),
        direction: "outgoing",
        record: service,
      },
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
    const response = Promise.withResolvers<{
      ok: true;
      data: RecordEditorResult;
    }>();
    mocks.getRecordEditorAction.mockReturnValue(response.promise);
    const refresh = store.reloadAfterNestedChange();
    store.onChange(`values.${id("deal.name")}`, "Unsaved draft");
    response.resolve({
      ok: true,
      data: { ...context("deal"), record: record(2) },
    });
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
    mocks.getRecordEditorAction.mockResolvedValue({
      ok: true,
      data: { ...context("deal"), record: record(2) },
    });
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
    mocks.getRecordEditorAction.mockResolvedValue({
      ok: true,
      data: { ...context("deal"), record: record(2) },
    });
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
  it("retains a nested-write refresh barrier and notifies the collection once after Retry", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const store = new RecordEditorStore(root, context("deal"), saved);
    store.edit(context("deal"), record());
    mocks.getRecordEditorAction.mockRejectedValueOnce(new Error("Parent read unavailable"));
    await expect(store.reloadAfterNestedChange()).rejects.toThrow("Parent read unavailable");
    expect(store.isReadOnly).toBe(true);
    expect(store.refreshRequired).toBe(true);
    expect(store.record?.version).toBe(1);
    await store.onSubmit();
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    mocks.getRecordEditorAction.mockResolvedValue({ ok: true, data: { ...context("deal"), record: record(2) } });
    await store.refreshRecord();
    expect(store.record?.version).toBe(2);
    expect(store.isReadOnly).toBe(false);
    expect(store.refreshRequired).toBe(false);
    expect(store.relatedRevision).toBe(1);
    expect(saved).toHaveBeenCalledOnce();
    await store.refreshRecord();
    expect(saved).toHaveBeenCalledOnce();
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
  });
});

describe("record editor refresh ordering", () => {
  it.each(["refreshRecord", "reloadAfterNestedChange"] as const)(
    "does not reopen a closed drawer after %s",
    async (method) => {
      const saved = vi.fn();
      const store = new RecordEditorStore(root, context("deal"), saved);
      store.edit(context("deal"), record());
      const response = Promise.withResolvers<{
        ok: true;
        data: RecordEditorResult;
      }>();
      mocks.getRecordEditorAction.mockReturnValue(response.promise);
      const pending = store[method]();
      store.close();
      response.resolve({
        ok: true,
        data: { ...context("deal"), record: record(2) },
      });
      await pending;
      expect(store.isOpen).toBe(false);
      expect(store.record?.version).toBe(1);
      expect(saved).not.toHaveBeenCalled();
    },
  );
  it("keeps the latest refresh when responses arrive in reverse order", async () => {
    const store = new RecordEditorStore(root, context("deal"), vi.fn());
    store.edit(context("deal"), record());
    const old = Promise.withResolvers<{ ok: true; data: RecordEditorResult }>();
    const latest = Promise.withResolvers<{
      ok: true;
      data: RecordEditorResult;
    }>();
    mocks.getRecordEditorAction.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const older = store.reloadAfterNestedChange();
    const newer = store.refreshRecord();
    latest.resolve({
      ok: true,
      data: { ...context("deal"), record: record(3) },
    });
    await newer;
    old.resolve({ ok: true, data: { ...context("deal"), record: record(2) } });
    await older;
    expect(store.record?.version).toBe(3);
    expect(store.form.values[id("deal.name")]).toBe("Deal 3");
  });
});

describe("record mutation request ownership", () => {
  it("preserves the new unsaved editor while an older record save completes and still refreshes the collection", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const store = new RecordEditorStore(root, context("deal"), saved);
    store.edit(context("deal"), record());
    store.onChange(`values.${id("deal.name")}`, "First saved name");
    const response = Promise.withResolvers<{
      ok: true;
      data: { status: "completed" };
    }>();
    mocks.mutateRecordAction.mockReturnValueOnce(response.promise);
    const pending = store.onSubmit();
    store.close();
    const other = {
      ...record(),
      ref: { typeId: id("deal"), recordId: randomUUID() },
    };
    store.edit(context("deal"), other);
    store.onChange(`values.${id("deal.name")}`, "Second unsaved name");
    response.resolve({ ok: true, data: { status: "completed" } });
    await pending;
    expect(store.isOpen).toBe(true);
    expect(store.record?.ref).toEqual(other.ref);
    expect(store.form.values[id("deal.name")]).toBe("Second unsaved name");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(saved).toHaveBeenCalledOnce();
  });
  it("does not copy an old queued mutation onto the current record", async () => {
    const saved = vi.fn();
    const store = new RecordEditorStore(root, context("deal"), saved);
    store.edit(context("deal"), record());
    const response = Promise.withResolvers<{
      ok: true;
      data: { status: "pending"; operationId: string };
    }>();
    mocks.mutateRecordAction.mockReturnValueOnce(response.promise);
    const pending = store.onSubmit();
    store.close();
    store.edit(context("deal"), {
      ...record(),
      ref: { typeId: id("deal"), recordId: randomUUID() },
    });
    response.resolve({
      ok: true,
      data: { status: "pending", operationId: randomUUID() },
    });
    await pending;
    expect(store.pendingOperationId).toBeNull();
    expect(store.isReadOnly).toBe(false);
    expect(saved).not.toHaveBeenCalled();
  });
  it("keeps a newer save loading when an old response settles first", async () => {
    const store = new RecordEditorStore(root, context("deal"), vi.fn());
    store.edit(context("deal"), record());
    const old = Promise.withResolvers<{
      ok: true;
      data: { status: "completed" };
    }>();
    const latest = Promise.withResolvers<{
      ok: true;
      data: { status: "completed" };
    }>();
    mocks.mutateRecordAction.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const previous = store.onSubmit();
    store.close();
    store.edit(context("deal"), {
      ...record(),
      ref: { typeId: id("deal"), recordId: randomUUID() },
    });
    const current = store.onSubmit();
    old.resolve({ ok: true, data: { status: "completed" } });
    await previous;
    expect(store.isLoading).toBe(true);
    latest.resolve({ ok: true, data: { status: "completed" } });
    await current;
    expect(store.isOpen).toBe(false);
    expect(store.isLoading).toBe(false);
  });
});

describe("explicit snapshot capture drafts", () => {
  it.each(
    (["input", "snapshot"] as const).flatMap((behavior) =>
      (["restricted", "missing", "value"] as const).map((state) => ({ behavior, state })),
    ),
  )("preserves $state summary visibility for $behavior draft previews", ({ behavior, state }) => {
    const source = model.fields.find((field) => field.id === id("deal.name"));
    if (!source) throw new Error("Expected seeded deal name");
    const field = {
      ...source,
      id: randomUUID(),
      label: "Retained name",
      behavior:
        behavior === "input"
          ? { kind: "input" as const }
          : {
              kind: "snapshot" as const,
              expression: { kind: "field" as const, fieldId: source.id },
              capture: "explicit" as const,
              allowManualOverride: true,
            },
    };
    const presentation = { ...context("deal"), model: { ...model, fields: [...model.fields, field] } };
    const result =
      state === "value" ? { state: "value" as const, value: { kind: "text" as const, value: "Before" } } : { state };
    const store = new RecordEditorStore(root, presentation, vi.fn());
    store.edit(presentation, { ...record(), fields: [...record().fields, { fieldId: field.id, result }] });
    expect(store.previewValue(field)).toEqual(result);
    store.onChange(`values.${field.id}`, "Edited preview");
    expect(store.previewValue(field)).toEqual(
      state === "restricted"
        ? { state: "restricted" }
        : { state: "value", value: { kind: "text", value: "Edited preview" } },
    );
  });

  it("captures in the same mutation as edited source values and omits a staged manual replacement", async () => {
    const source = model.fields.find((field) => field.id === id("deal.name"));
    if (!source) throw new Error("Expected seeded deal name");
    const captured = {
      ...source,
      id: randomUUID(),
      label: "Captured name",
      behavior: {
        kind: "snapshot" as const,
        expression: { kind: "field" as const, fieldId: source.id },
        capture: "explicit" as const,
        allowManualOverride: true,
      },
    };
    const presentation = {
      ...context("deal"),
      model: { ...model, fields: [...model.fields, captured] },
    };
    const stored = {
      ...record(),
      fields: [
        ...record().fields,
        {
          fieldId: captured.id,
          result: {
            state: "value" as const,
            value: { kind: "text" as const, value: "Before" },
          },
        },
      ],
    };
    const store = new RecordEditorStore(root, presentation, vi.fn());
    store.edit(presentation, stored);
    store.onChange(`values.${source.id}`, "Edited source");
    store.onChange(`values.${captured.id}`, "Manual replacement");
    store.toggleCapture(captured.id);
    expect(store.form.captureFieldIds).toEqual([captured.id]);
    expect(store.hasUnsavedChanges).toBe(true);
    mocks.mutateRecordAction.mockRejectedValueOnce(new Error("Response uncertain"));
    await expect(store.onSubmit()).rejects.toThrow("Response uncertain");
    expect(mocks.mutateRecordAction.mock.calls[0][0].mutation).toMatchObject({
      action: "update",
      captureFieldIds: [captured.id],
      fields: [{ fieldId: source.id, value: { kind: "text", value: "Edited source" } }],
    });
    expect(store.form.values[captured.id]).toBe("Manual replacement");
    store.toggleCapture(captured.id);
    expect(store.form.captureFieldIds).toEqual([]);
    store.toggleCapture(captured.id);
    store.resetForm();
    expect(store.form.captureFieldIds).toEqual([]);
    expect(store.form.values[captured.id]).toBe("Before");
    store.edit({ ...presentation, permittedActions: ["readAll"] }, stored);
    store.toggleCapture(captured.id);
    expect(store.form.captureFieldIds).toEqual([]);
    store.edit(presentation, null);
    store.toggleCapture(captured.id);
    expect(store.form.captureFieldIds).toEqual([]);
  });
});

describe("record editor stale draft recovery", () => {
  const nameId = id("deal.name");
  const conflict = (code: "recordVersionChanged" | "recordSchemaChanged") => ({
    ok: false,
    error: { errors: ["The record changed"] },
    failure: { kind: "conflict", issues: [{ code: "custom", path: [], message: "changed", customCode: code }] },
  });
  const withName = (version: number, name: string, extra: RecordDto["fields"] = []): RecordDto => ({
    ...record(version),
    fields: [{ fieldId: nameId, result: { state: "value", value: { kind: "text", value: name } } }, ...extra],
  });

  it.each(["recordVersionChanged", "recordSchemaChanged"] as const)(
    "keeps the draft after %s and rebases it onto the latest record, surfacing conflicting fields",
    async (code) => {
      const store = new RecordEditorStore(root, context("deal"), vi.fn(), true);
      store.edit(context("deal"), withName(1, "Deal 1"));
      store.onChange(`values.${nameId}`, "My draft");
      mocks.mutateRecordAction.mockResolvedValueOnce(conflict(code));
      await store.onSubmit();
      expect(store.refreshRequired).toBe(true);
      expect(store.staleChange).toBe(true);
      expect(store.isReadOnly).toBe(true);
      expect(store.form.values[nameId]).toBe("My draft");

      mocks.getRecordEditorAction.mockResolvedValueOnce({
        ok: true,
        data: { ...context("deal"), record: withName(2, "Someone else") },
      });
      await store.reloadKeepingChanges();
      expect(store.record?.version).toBe(2);
      expect(store.refreshRequired).toBe(false);
      expect(store.staleChange).toBe(false);
      expect(store.form.values[nameId]).toBe("My draft");
      expect(store.conflicts).toEqual([nameId]);
      expect(store.isReadOnly).toBe(true);

      store.resolveConflicts("draft");
      expect(store.isReadOnly).toBe(false);
      mocks.mutateRecordAction.mockResolvedValueOnce({
        ok: true,
        data: { status: "completed", refs: [record().ref], schemaRevision: 1 },
      });
      mocks.getRecordEditorAction.mockResolvedValueOnce({
        ok: true,
        data: { ...context("deal"), record: withName(3, "My draft") },
      });
      await store.onSubmit();
      const retry = mocks.mutateRecordAction.mock.calls[1][0];
      expect(retry.mutation.expectedVersion).toBe(2);
      expect(retry.mutation.fields).toEqual([{ fieldId: nameId, value: { kind: "text", value: "My draft" } }]);
      expect(retry.idempotencyKey).not.toBe(mocks.mutateRecordAction.mock.calls[0][0].idempotencyKey);
    },
  );

  it("adopts unrelated server changes without conflicts and can discard a conflicting draft value", async () => {
    const source = model.fields.find((field) => field.id === nameId);
    if (!source) throw new Error("Expected seeded deal name");
    const other = { ...source, id: randomUUID(), label: "Other" };
    const presentation = { ...context("deal"), model: { ...model, fields: [...model.fields, other] } };
    const otherValue = (value: string) => ({
      fieldId: other.id,
      result: { state: "value" as const, value: { kind: "text" as const, value } },
    });
    const store = new RecordEditorStore(root, presentation, vi.fn(), true);
    store.edit(presentation, withName(1, "Deal 1", [otherValue("Before")]));
    store.onChange(`values.${nameId}`, "My draft");
    store.setRefreshRequired(true);
    mocks.getRecordEditorAction.mockResolvedValueOnce({
      ok: true,
      data: { ...presentation, record: withName(2, "Deal 1", [otherValue("Server")]) },
    });
    await store.reloadKeepingChanges();
    expect(store.conflicts).toEqual([]);
    expect(store.form.values[nameId]).toBe("My draft");
    expect(store.form.values[other.id]).toBe("Server");
    expect(store.savedState.values[other.id]).toBe("Server");
    expect(store.isReadOnly).toBe(false);

    store.onChange(`values.${other.id}`, "Mine");
    store.setRefreshRequired(true);
    mocks.getRecordEditorAction.mockResolvedValueOnce({
      ok: true,
      data: { ...presentation, record: withName(3, "Deal 1", [otherValue("Server again")]) },
    });
    await store.reloadKeepingChanges();
    expect(store.conflicts).toEqual([other.id]);
    store.resolveConflicts("latest");
    expect(store.form.values[other.id]).toBe("Server again");
    expect(store.form.values[nameId]).toBe("My draft");
    expect(store.conflicts).toEqual([]);
  });

  it("flags a newer page payload instead of silently dropping it while a draft is open", () => {
    const store = new RecordEditorStore(root, context("deal"), vi.fn(), true);
    store.edit(context("deal"), withName(1, "Deal 1"));
    store.onChange(`values.${nameId}`, "My draft");
    store.receiveLatest({ ...context("deal"), record: withName(1, "Deal 1") });
    expect(store.refreshRequired).toBe(false);
    store.receiveLatest({ ...context("deal"), record: withName(2, "Someone else") });
    expect(store.refreshRequired).toBe(true);
    expect(store.record?.version).toBe(1);
    expect(store.form.values[nameId]).toBe("My draft");

    const clean = new RecordEditorStore(root, context("deal"), vi.fn(), true);
    clean.edit(context("deal"), withName(1, "Deal 1"));
    clean.receiveLatest({ ...context("deal"), record: withName(2, "Someone else") });
    expect(clean.record?.version).toBe(2);
    expect(clean.form.values[nameId]).toBe("Someone else");
    clean.receiveLatest({ ...context("deal"), record: withName(1, "Deal 1") });
    expect(clean.record?.version).toBe(2);
  });
});

describe("record editor draft handoff to the full page", () => {
  const nameId = id("deal.name");
  const named = (version: number, name: string): RecordDto => ({
    ...record(version),
    fields: [{ fieldId: nameId, result: { state: "value", value: { kind: "text", value: name } } }],
  });

  it("carries a drawer draft into the page editor and rebases it onto the page's newer record", () => {
    const drawer = new RecordEditorStore(root, context("deal"), vi.fn());
    drawer.edit(context("deal"), named(1, "Deal 1"));
    drawer.onChange(`values.${nameId}`, "Drawer draft");
    const handoff = {
      presentation: drawer.presentation,
      record: drawer.record as RecordDto,
      savedState: toJS(drawer.savedState),
      form: toJS(drawer.form),
    };

    const same = new RecordEditorStore(root, context("deal"), vi.fn(), true);
    same.edit(context("deal"), named(1, "Deal 1"));
    same.restoreDraft(handoff, context("deal"), named(1, "Deal 1"));
    expect(same.form.values[nameId]).toBe("Drawer draft");
    expect(same.hasUnsavedChanges).toBe(true);
    expect(same.conflicts).toEqual([]);
    expect(same.record?.version).toBe(1);

    const newer = new RecordEditorStore(root, context("deal"), vi.fn(), true);
    newer.edit(context("deal"), named(2, "Someone else"));
    newer.restoreDraft(handoff, context("deal"), named(2, "Someone else"));
    expect(newer.form.values[nameId]).toBe("Drawer draft");
    expect(newer.record?.version).toBe(2);
    expect(newer.conflicts).toEqual([nameId]);
  });
});
