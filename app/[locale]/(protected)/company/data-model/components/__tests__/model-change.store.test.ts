import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";
import { createCrmPreset } from "@/features/records/crm-preset";

const actions = vi.hoisted(() => ({
  previewRecordConfigurationAction: vi.fn(),
  applyRecordConfigurationAction: vi.fn(),
  getRecordModelAction: vi.fn(),
}));
vi.mock("../../../../records/actions", () => actions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
import { ModelChangeStore } from "../model-change.store";

const model = createCrmPreset("6487f9fb-7b10-439a-b783-9d3da8184b14", "EUR");
const preview = (count = 1): ConfigurationPreview => ({
  expectedRevision: model.revision,
  nextRevision: model.revision + 1,
  valid: true,
  execution: "synchronous",
  dataValidation: "complete",
  affectedRecords: count,
  references: [],
  issues: [],
  calculations: [],
});
class DefinitionStore extends ModelChangeStore<{ name: string }> {
  enableAutoApply() {
    this.immediateApply = true;
  }
  edit(name: string) {
    this.resetModel(model);
    this.onInitOrRefresh({ name });
    this.open();
  }
  protected projectLatestModel(latest: typeof model) {
    return { name: latest.types[0].label };
  }
  operations(): ConfigurationChange["operations"] {
    return [
      {
        operation: "putType",
        type: { ...this.model.types[0], label: this.form.name },
      },
    ];
  }
}
function fixture(admin = false) {
  const refreshNavigation = vi.fn().mockResolvedValue(undefined);
  const completed = vi.fn().mockResolvedValue(undefined);
  const root = {
    recordWorkspaceStore: { refreshNavigation },
  } as unknown as RootStore;
  const store = new DefinitionStore(root, { name: "" }, model, completed, admin);
  store.edit("First definition");
  return { store, completed, refreshNavigation };
}
beforeEach(() => vi.resetAllMocks());

describe("configuration editor request ownership", () => {
  it("ignores an old preview without clearing a newer editor's loading state", async () => {
    const { store } = fixture();
    const old = Promise.withResolvers<{
      ok: true;
      data: ConfigurationPreview;
    }>();
    const latest = Promise.withResolvers<{
      ok: true;
      data: ConfigurationPreview;
    }>();
    actions.previewRecordConfigurationAction.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const previous = store.onSubmit();
    store.close();
    store.edit("Second definition");
    const current = store.onSubmit();
    old.resolve({ ok: true, data: preview(10) });
    await previous;
    expect(store.form.name).toBe("Second definition");
    expect(store.preview).toBeNull();
    expect(store.isLoading).toBe(true);
    latest.resolve({ ok: true, data: preview(20) });
    await current;
    expect(store.preview?.affectedRecords).toBe(20);
    expect(store.isLoading).toBe(false);
  });
  it("keeps a new unsaved draft open when an earlier apply completes, while synchronizing the accepted write", async () => {
    const { store, completed, refreshNavigation } = fixture();
    store.setPreview(preview());
    const response = Promise.withResolvers<{
      ok: true;
      data: { status: "completed" };
    }>();
    actions.applyRecordConfigurationAction.mockReturnValueOnce(response.promise);
    const pending = store.onSubmit();
    store.close();
    store.edit("Second definition");
    store.onChange("name", "Unsaved second definition");
    response.resolve({ ok: true, data: { status: "completed" } });
    await pending;
    expect(store.isOpen).toBe(true);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.form.name).toBe("Unsaved second definition");
    expect(store.preview).toBeNull();
    expect(refreshNavigation).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0][1]()).toBe(false);
  });
  it("does not attach an earlier definition's staged operation to the new editor", async () => {
    const { store, completed } = fixture();
    store.setPreview(preview());
    const response = Promise.withResolvers<{
      ok: true;
      data: { status: "pending"; operationId: string };
    }>();
    actions.applyRecordConfigurationAction.mockReturnValueOnce(response.promise);
    const pending = store.onSubmit();
    store.close();
    store.edit("Second definition");
    response.resolve({
      ok: true,
      data: { status: "pending", operationId: crypto.randomUUID() },
    });
    await pending;
    expect(store.pendingOperationId).toBeNull();
    expect(store.isReadOnly).toBe(false);
    expect(completed).not.toHaveBeenCalled();
  });
  it("refreshes a stale preview in place and requires a new preview before apply", async () => {
    const { store } = fixture();
    store.onChange("name", "My draft");
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({
      ok: false,
      error: { errors: ["The data model changed"] },
      failure: {
        kind: "conflict",
        issues: [{ code: "custom", path: [], message: "changed", customCode: "recordSchemaChanged" }],
      },
    });
    await store.onSubmit();
    expect(store.refreshRequired).toBe(true);
    expect(store.form.name).toBe("My draft");
    const latest = structuredClone(model);
    latest.revision = 2;
    latest.types[0].label = "First definition";
    actions.getRecordModelAction.mockResolvedValueOnce(latest);
    await store.refreshModel();
    expect(store.refreshRequired).toBe(false);
    expect(store.conflicts).toEqual([]);
    expect(store.form.name).toBe("My draft");
    expect(store.model.revision).toBe(2);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({
      ok: true,
      data: { ...preview(), expectedRevision: 2 },
    });
    await store.onSubmit();
    expect(actions.previewRecordConfigurationAction.mock.calls.at(-1)?.[0].expectedRevision).toBe(2);
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
  });
  it("recognizes a stale apply and never reapplies the prior preview", async () => {
    const { store } = fixture();
    store.onChange("name", "My draft");
    store.setPreview(preview());
    actions.applyRecordConfigurationAction.mockResolvedValueOnce({
      ok: false,
      error: { errors: ["The data model changed"] },
      failure: {
        kind: "conflict",
        issues: [{ code: "custom", path: [], message: "changed", customCode: "recordSchemaChanged" }],
      },
    });
    await store.onSubmit();
    expect(store.refreshRequired).toBe(true);
    expect(store.preview).toBeNull();
    expect(store.form.name).toBe("My draft");
    await store.onSubmit();
    expect(actions.applyRecordConfigurationAction).toHaveBeenCalledTimes(1);
    expect(actions.previewRecordConfigurationAction).not.toHaveBeenCalled();
  });
  it("does not auto-apply an immediate editor after recovering from a stale preview", async () => {
    const { store } = fixture();
    store.enableAutoApply();
    store.onChange("name", "My draft");
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({
      ok: false,
      error: { errors: ["The data model changed"] },
      failure: {
        kind: "conflict",
        issues: [{ code: "custom", path: [], message: "changed", customCode: "recordSchemaChanged" }],
      },
    });
    await store.onSubmit();
    const latest = structuredClone(model);
    latest.revision = 2;
    latest.types[0].label = "First definition";
    actions.getRecordModelAction.mockResolvedValueOnce(latest);
    await store.refreshModel();
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({
      ok: true,
      data: { ...preview(), expectedRevision: 2 },
    });
    await store.onSubmit();
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
    expect(store.previewReady).toBe(true);
  });
  it("requires a choice for a same-control conflict and can load the latest value", async () => {
    const { store } = fixture();
    store.onChange("name", "My draft");
    const latest = structuredClone(model);
    latest.revision = 2;
    latest.types[0].label = "Remote";
    actions.getRecordModelAction.mockResolvedValueOnce(latest);
    await store.refreshModel();
    expect(store.conflicts).toEqual(["name"]);
    expect(store.form.name).toBe("My draft");
    await store.onSubmit();
    expect(actions.previewRecordConfigurationAction).not.toHaveBeenCalled();
    store.resolveConflicts("latest");
    expect(store.form.name).toBe("Remote");
    expect(store.conflicts).toEqual([]);
  });
  it("ignores a model refresh that completes after a new editor opens", async () => {
    const { store } = fixture();
    const pending = Promise.withResolvers<typeof model>();
    actions.getRecordModelAction.mockReturnValueOnce(pending.promise);
    const old = store.refreshModel();
    store.close();
    store.edit("New draft");
    pending.resolve({ ...model, revision: 3 });
    await old;
    expect(store.form.name).toBe("New draft");
    expect(store.model.revision).toBe(1);
  });
  it("retains the draft and offers another refresh after a transport failure", async () => {
    const { store } = fixture();
    store.onChange("name", "My draft");
    store.markRefreshRequired();
    actions.getRecordModelAction.mockRejectedValueOnce(new Error("offline"));
    await store.refreshModel();
    expect(store.refreshFailed).toBe(true);
    expect(store.form.name).toBe("My draft");
    actions.getRecordModelAction.mockResolvedValueOnce({ ...model, revision: 2 });
    await store.refreshModel();
    expect(store.refreshFailed).toBe(false);
    expect(store.model.revision).toBe(2);
  });
  it("invalidates a pending preview when the definition changes and requires another preview", async () => {
    const { store } = fixture();
    const response = Promise.withResolvers<{
      ok: true;
      data: ConfigurationPreview;
    }>();
    actions.previewRecordConfigurationAction.mockReturnValueOnce(response.promise);
    const pending = store.onSubmit();
    store.onChange("name", "Changed definition");
    response.resolve({ ok: true, data: preview() });
    await pending;
    expect(store.preview).toBeNull();
    expect(store.isLoading).toBe(false);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({
      ok: true,
      data: preview(),
    });
    await store.onSubmit();
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
    expect(store.preview).toEqual(preview());
    expect(actions.previewRecordConfigurationAction.mock.calls[1][0].idempotencyKey).not.toBe(
      actions.previewRecordConfigurationAction.mock.calls[0][0].idempotencyKey,
    );
  });
});

describe("explicit approval of affected published summaries", () => {
  const field =
    model.fields.find((candidate) => candidate.behavior.kind === "formula") ??
    (() => {
      throw new Error("The formula fixture is missing");
    })();
  const dependencyHash = "a".repeat(64);
  function required() {
    const result = preview();
    result.valid = false;
    result.issues = [{ code: "summary_approval_required", fieldId: field.id }];
    result.calculations = [{ fieldId: field.id, dependencyHash }];
    return result;
  }
  function ready() {
    return { ...preview(), calculations: [{ fieldId: field.id, dependencyHash }] };
  }
  beforeEach(() => {
    field.publishedSummary = true;
  });
  it("does not renew a different field silently and applies exactly the explicitly approved preview bundle", async () => {
    const { store } = fixture(true);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: required() });
    await store.onSubmit();
    expect(store.summaryRenewal?.approved).toBe(false);
    expect(
      actions.previewRecordConfigurationAction.mock.calls[0][0].operations.some(
        (operation: ConfigurationChange["operations"][number]) => operation.operation === "publishSummary",
      ),
    ).toBe(false);
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
    store.setSummaryRenewalsApproved(true);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: ready() });
    await store.onSubmit();
    const approved = actions.previewRecordConfigurationAction.mock.calls[1][0];
    expect(approved.operations).toContainEqual({
      operation: "publishSummary",
      fieldId: field.id,
      published: true,
      dependencyHash,
    });
    expect(store.summaryRenewal?.approved).toBe(true);
    expect(store.previewReady).toBe(true);
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
    actions.applyRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: { status: "completed" } });
    await store.onSubmit();
    expect(actions.applyRecordConfigurationAction).toHaveBeenCalledExactlyOnceWith(approved);
  });
  it("keeps delegated schema managers blocked without exposing an approval control", async () => {
    const { store } = fixture();
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: required() });
    await store.onSubmit();
    expect(store.summaryRenewal).toBeUndefined();
    store.setSummaryRenewalsApproved(true);
    await store.onSubmit();
    expect(store.summaryRenewalsApproved).toBe(false);
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
  });
  it("requires another preview when approval is withdrawn and drops it when the source draft changes", async () => {
    const { store } = fixture(true);
    store.setPreview(required());
    store.setSummaryRenewalsApproved(true);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: ready() });
    await store.onSubmit();
    store.setSummaryRenewalsApproved(false);
    expect(store.previewReady).toBe(false);
    actions.previewRecordConfigurationAction.mockResolvedValueOnce({ ok: true, data: required() });
    await store.onSubmit();
    expect(
      actions.previewRecordConfigurationAction.mock.calls[1][0].operations.some(
        (operation: ConfigurationChange["operations"][number]) => operation.operation === "publishSummary",
      ),
    ).toBe(false);
    expect(store.preview?.valid).toBe(false);
    store.setSummaryRenewalsApproved(true);
    store.onChange("name", "New source definition");
    expect(store.summaryRenewalsApproved).toBe(false);
    expect(store.summaryRenewalCandidates).toEqual([]);
    expect(store.preview).toBeNull();
  });
  it("drops an in-flight renewal response after its editor closes and reopens", async () => {
    const { store } = fixture(true);
    store.setPreview(required());
    store.setSummaryRenewalsApproved(true);
    const response = Promise.withResolvers<{ ok: true; data: ConfigurationPreview }>();
    actions.previewRecordConfigurationAction.mockReturnValueOnce(response.promise);
    const old = store.onSubmit();
    store.close();
    store.edit("Another definition");
    response.resolve({ ok: true, data: ready() });
    await old;
    expect(store.preview).toBeNull();
    expect(store.summaryRenewalCandidates).toEqual([]);
    expect(store.summaryRenewalsApproved).toBe(false);
    expect(actions.applyRecordConfigurationAction).not.toHaveBeenCalled();
  });
  it("invalidates pending approval when server-derived publication authority is revoked", () => {
    const { store } = fixture(true);
    store.setPreview(required());
    store.setSummaryRenewalsApproved(true);
    store.setCanRenewSummaries(false);
    expect(store.preview).toBeNull();
    expect(store.summaryRenewal).toBeUndefined();
    expect(store.summaryRenewalsApproved).toBe(false);
  });
});
