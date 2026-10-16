import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";

const englishTranslator = createTranslator({ locale: "en", messages: en }) as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string;

const actionsMock = vi.hoisted(() => ({
  archiveAgentConversationAction: vi.fn(),
  cancelAgentTurnAction: vi.fn(),
  deleteAgentConversationAction: vi.fn(),
  getAgentConfigAction: vi.fn(),
  getAgentConversationAction: vi.fn(),
  listAgentConversationsAction: vi.fn(),
  restoreAgentConversationAction: vi.fn(),
  respondToApprovalAction: vi.fn(),
  respondToUiCommandAction: vi.fn(),
}));
const transferMock = vi.hoisted(() => ({
  completeChatFileUpload: vi.fn(),
  sendRecordFileBytes: vi.fn(),
  startChatFileUpload: vi.fn(),
}));

vi.mock("../actions", () => actionsMock);
vi.mock("@/components/records/record-file-upload", () => transferMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/errors/report-application-error", () => ({
  isDemoEnvironment: () => false,
  reportApplicationError: vi.fn(),
}));

import { AgentChatStore } from "../agent-chat.store";

const FILE_ID = "63000000-0000-4000-8000-000000000001";
const UPLOAD = {
  url: "https://store.example/put",
  method: "PUT" as const,
  headers: {},
  expiresAt: "2026-10-16T15:00:00.000Z",
};

function root() {
  return {
    userStore: { user: { id: "user-1", companyId: "company-1" } },
    localeStore: { locale: "en", translation: null, getTranslation: englishTranslator },
    agentUiControlStore: { active: false },
  };
}

function file(name = "Offer.pdf", size = 2_048, type = "application/pdf") {
  return new File([new Uint8Array(size)], name, { type });
}

function fileContext(index: number) {
  return {
    reference: {
      kind: "file" as const,
      fileId: `63000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
      mimeType: "text/plain",
      size: 10,
    },
    label: `Note ${index}.txt`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgentChatStore attached files", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", pathname: "/dashboard", search: "" },
      localStorage: { getItem: () => null, setItem: () => undefined },
    });
    transferMock.startChatFileUpload.mockResolvedValue({
      ok: true,
      data: { fileId: FILE_ID, upload: UPLOAD },
    });
    transferMock.completeChatFileUpload.mockResolvedValue({
      ok: true,
      data: {
        id: FILE_ID,
        typeId: null,
        fieldId: null,
        recordId: null,
        name: "Offer.pdf",
        mimeType: "application/pdf",
        size: 2_048,
        status: "pending",
        uploadedAt: "2026-10-16T14:00:00.000Z",
        uploadedById: "user-1",
        extractionStatus: "done",
      },
    });
    transferMock.sendRecordFileBytes.mockImplementation(
      (_upload: unknown, _file: File, onProgress: (loaded: number, total: number) => void) => {
        onProgress(1_024, 2_048);
        return { done: Promise.resolve({ ok: true }), abort: vi.fn() };
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uploads each file, then turns it into a file context named after the stored file", async () => {
    const store = new AgentChatStore(root() as never, { persistOpenState: false });
    store.addComposerFiles([file()]);
    expect(store.composerUploads).toMatchObject([{ name: "Offer.pdf", phase: "uploading", failure: null }]);
    expect(store.hasPendingComposerUploads).toBe(true);
    await flush();

    expect(transferMock.startChatFileUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "Offer.pdf" }));
    expect(transferMock.sendRecordFileBytes).toHaveBeenCalledWith(UPLOAD, expect.any(File), expect.any(Function));
    expect(transferMock.completeChatFileUpload).toHaveBeenCalledWith(FILE_ID);
    expect(store.composerUploads).toEqual([]);
    expect(store.composerContexts).toEqual([
      { reference: { kind: "file", fileId: FILE_ID, mimeType: "application/pdf", size: 2_048 }, label: "Offer.pdf" },
    ]);
    expect(store.hasPendingComposerUploads).toBe(false);
  });

  it("keeps a refused upload visible with the server's message without blocking the message", async () => {
    transferMock.startChatFileUpload.mockResolvedValue({ ok: false, message: "A file can be at most 25 MB." });
    const store = new AgentChatStore(root() as never, { persistOpenState: false });
    store.addComposerFiles([file("Huge.mov", 4, "video/quicktime")]);
    await flush();

    expect(store.composerUploads).toMatchObject([
      { name: "Huge.mov", phase: "failed", failure: "A file can be at most 25 MB." },
    ]);
    expect(store.hasPendingComposerUploads).toBe(false);
    expect(store.composerContexts).toEqual([]);

    transferMock.sendRecordFileBytes.mockReturnValueOnce({
      done: Promise.resolve({ ok: false, message: null, aborted: false }),
      abort: vi.fn(),
    });
    transferMock.startChatFileUpload.mockResolvedValue({
      ok: true,
      data: { fileId: FILE_ID, upload: UPLOAD },
    });
    store.addComposerFiles([file("Lost.pdf")]);
    await flush();
    expect(store.composerUploads.at(-1)).toMatchObject({
      name: "Lost.pdf",
      phase: "failed",
      failure: "The upload failed. Try again.",
    });
  });

  it("accepts at most ten files per message", async () => {
    const store = new AgentChatStore(root() as never, { persistOpenState: false });
    store.composerContexts = Array.from({ length: 9 }, (_, index) => fileContext(index));
    store.addComposerFiles([file("One.pdf"), file("Two.pdf"), file("Three.pdf")]);

    expect(store.composerUploads.map((upload) => [upload.name, upload.phase])).toEqual([
      ["One.pdf", "uploading"],
      ["Two.pdf", "failed"],
      ["Three.pdf", "failed"],
    ]);
    expect(store.composerUploads[1].failure).toBe("You can attach up to 10 files to one message.");
    await flush();
    expect(store.composerContexts).toHaveLength(10);
  });

  it("does not send while a file is still uploading and sends its file context afterwards", async () => {
    const done = deferred<{ ok: true }>();
    transferMock.sendRecordFileBytes.mockReturnValue({ done: done.promise, abort: vi.fn() });
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const store = new AgentChatStore(root() as never, { persistOpenState: false });
    store.addComposerFiles([file()]);
    store.setComposerDraft("Attach this to the Northwind deal");
    await flush();

    store.submitDraft();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.composerDraft).toBe("Attach this to the Northwind deal");

    done.resolve({ ok: true });
    await flush();
    store.submitDraft();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.contexts).toEqual([
      { reference: { kind: "file", fileId: FILE_ID, mimeType: "application/pdf", size: 2_048 }, label: "Offer.pdf" },
    ]);
    expect(store.composerContexts).toEqual([]);
  });

  it("cancels an upload whose chip the user removes and forgets it for a new chat", async () => {
    const abort = vi.fn();
    const done = deferred<{ ok: false; message: null; aborted: true }>();
    transferMock.sendRecordFileBytes.mockReturnValue({ done: done.promise, abort });
    const store = new AgentChatStore(root() as never, { persistOpenState: false });
    store.addComposerFiles([file()]);
    await flush();

    store.removeComposerUpload(store.composerUploads[0].key);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(store.composerUploads).toEqual([]);
    done.resolve({ ok: false, message: null, aborted: true });
    await flush();
    expect(store.composerContexts).toEqual([]);

    const next = deferred<{ ok: true }>();
    const abortNext = vi.fn();
    transferMock.sendRecordFileBytes.mockReturnValue({ done: next.promise, abort: abortNext });
    store.addComposerFiles([file("Next.pdf")]);
    await flush();
    store.newConversation();
    expect(abortNext).toHaveBeenCalledTimes(1);
    next.resolve({ ok: true });
    await flush();
    expect(store.composerUploads).toEqual([]);
    expect(store.composerContexts).toEqual([]);
  });
});
