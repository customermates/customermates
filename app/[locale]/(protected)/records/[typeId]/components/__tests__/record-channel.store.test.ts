import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAutoObservable } from "mobx";
import type { RecordEditorStore } from "../record-editor.store";
import { RecordChannelStore } from "../record-channel.store";

const mocks = vi.hoisted(() => ({ search: vi.fn(), check: vi.fn(), resolve: vi.fn(), toast: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  searchRecordChannelsAction: mocks.search,
  checkRecordIdentityAction: mocks.check,
}));
vi.mock("@/app/[locale]/(protected)/inbox/actions", () => ({ resolveProviderProfileAction: mocks.resolve }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: mocks.toast }));
const candidate = {
  provider: "mail" as const,
  value: "person@example.test",
  messagingId: null,
  displayName: "Person",
  profileUrl: null,
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(permissions = true) {
  const changed = vi.fn();
  const editor = makeAutoObservable({
    form: { identities: [] as Array<typeof candidate> },
    record: { ref: { recordId: "record" } },
    presentation: { typeId: "type" },
    isDisabled: false,
    rootStore: {
      userStore: { can: () => permissions },
      connectedAccountsStore: {
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        usableSendersFor: () => [{ id: "account" }],
      },
    },
    onChange: changed,
  });
  return { editor, changed, store: new RecordChannelStore(editor as unknown as RecordEditorStore) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.search.mockResolvedValue({ ok: true, data: [] });
  mocks.check.mockResolvedValue({ ok: true, data: { available: true } });
});
afterEach(() => vi.useRealTimers());
describe("record channel suggestions", () => {
  it("discards an older response after the query changes and a response after closing", async () => {
    const old = deferred<unknown>(),
      latest = deferred<unknown>();
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const { store } = fixture();
    store.setOpen(true);
    store.setQuery("Older person");
    await vi.advanceTimersByTimeAsync(300);
    store.setQuery("Latest person");
    await vi.advanceTimersByTimeAsync(300);
    old.resolve({ ok: true, data: [candidate] });
    await Promise.resolve();
    expect(store.mergedCandidates).toEqual([]);
    store.setOpen(false);
    latest.resolve({ ok: true, data: [candidate] });
    await Promise.resolve();
    expect(store.mergedCandidates).toEqual([]);
    expect(store.open).toBe(false);
  });
  it("keeps a manually entered channel available without inbox access or provider calls", async () => {
    const { store, changed } = fixture(false);
    store.setOpen(true);
    store.setQuery("PERSON@example.test");
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    await store.addAsNew("mail");
    expect(changed).toHaveBeenCalledWith("identities", [{ provider: "mail", value: "person@example.test" }]);
  });
  it("deduplicates email-provider aliases and excludes channels already in the draft", async () => {
    const { store, editor } = fixture();
    editor.form.identities = [candidate];
    mocks.search.mockResolvedValue({ ok: true, data: [{ ...candidate, provider: "outlook" }] });
    store.setOpen(true);
    store.setQuery("Person");
    await vi.advanceTimersByTimeAsync(300);
    expect(store.mergedCandidates).toEqual([]);
    store.setQuery("person@example.test");
    expect(store.addAsNewOptions).toEqual([]);
  });
  it("preserves provider profile identity when adding a resolved handle", async () => {
    const { store, changed } = fixture();
    mocks.resolve.mockResolvedValue({
      ok: true,
      data: {
        provider: "linkedin",
        providerId: "urn:person",
        publicIdentifier: "person",
        displayName: "Resolved Person",
        profileUrl: "https://www.linkedin.com/in/person",
      },
    });
    store.setOpen(true);
    store.setQuery("https://www.linkedin.com/in/person");
    await vi.advanceTimersByTimeAsync(600);
    const [resolved] = store.mergedCandidates;
    expect(resolved.source).toBe("lookup");
    await store.selectCandidate(resolved.candidate);
    expect(changed.mock.calls[0][1][0]).toMatchObject({
      provider: "linkedin",
      messagingId: "urn:person",
      displayName: "Resolved Person",
    });
  });
  it("retains the draft on a uniqueness rejection and ignores approval arriving for another record", async () => {
    const { store, editor, changed } = fixture();
    store.setOpen(true);
    store.setQuery(candidate.value);
    mocks.check.mockResolvedValueOnce({ ok: false, error: { errors: ["Already linked"] } });
    await store.selectCandidate(candidate);
    expect(changed).not.toHaveBeenCalled();
    expect(store.query).toBe(candidate.value);
    expect(mocks.toast).toHaveBeenCalledOnce();
    const pending = deferred<unknown>();
    mocks.check.mockReturnValueOnce(pending.promise);
    const adding = store.selectCandidate(candidate);
    editor.record.ref.recordId = "different-record";
    pending.resolve({ ok: true, data: { available: true } });
    await adding;
    expect(changed).not.toHaveBeenCalled();
  });
});
