import type { RecordFileDetails } from "@/features/records/record-file-upload.repo";

import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { AgentNativeFileLoader } from "../agent-native-file-loader";
import { planAgentAttachments } from "../agent-attachments";
import { AGENT_NATIVE_FILE_MAX_BYTES } from "../agent-native-files";

const CARD = "64000000-0000-4000-8000-000000000001";
const SCAN = "64000000-0000-4000-8000-000000000002";

function details(id: string, overrides: Partial<RecordFileDetails> = {}): RecordFileDetails {
  return {
    id,
    typeId: null,
    fieldId: null,
    recordId: null,
    conversationId: null,
    storageDriver: "database",
    storageKey: `company/${id}`,
    name: "Card.png",
    mimeType: "image/png",
    size: 6,
    sha256: null,
    status: "pending",
    uploadedById: "user-1",
    createdAt: new Date(),
    attachedAt: null,
    detachedAt: null,
    extractionStatus: "unsupported",
    pageCount: null,
    ...overrides,
  };
}

function stream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("loading attached files for the model", () => {
  it("reads each attached image as the user may see it and marks a file it cannot read as unavailable", async () => {
    const plan = planAgentAttachments({
      files: [
        {
          id: CARD,
          name: "Card.png",
          mimeType: "image/png",
          size: 6,
          extractionStatus: "unsupported",
          pageCount: null,
        },
        {
          id: SCAN,
          name: "Scan.png",
          mimeType: "image/png",
          size: 6,
          extractionStatus: "unsupported",
          pageCount: null,
        },
      ],
      excerpts: new Map(),
      modelId: "anthropic/claude-haiku-5.5",
      roomBytes: 60_000,
    });
    const readable = vi.fn((fileId: string) =>
      fileId === CARD ? Promise.resolve(details(CARD)) : Promise.reject(new Error("File not found")),
    );
    const read = vi.fn(() => Promise.resolve({ stream: stream("bytes!"), size: 6, contentType: "image/png" }));
    const loader = new AgentNativeFileLoader({ readable }, () => ({ read }) as never);
    const history = { role: "assistant", text: "Earlier answer" };

    const [assistant, user] = await loader.load([
      history,
      { role: "user", text: "Who is on these cards?", attachedText: plan.attachedText, files: plan.nativeFiles },
    ]);

    expect(assistant).toBe(history);
    expect(user.files).toEqual([
      { fileId: CARD, mediaType: "image/png", name: "Card.png", data: Buffer.from("bytes!").toString("base64") },
    ]);
    expect(user.attachedText).toContain(`<file fileId="${CARD}" name="Card.png" content="file"/>`);
    expect(user.attachedText).toContain(`<file fileId="${SCAN}" name="Scan.png" content="none" reason="unavailable"/>`);
    expect(readable).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("never sends bytes whose type or size no longer matches what was planned", async () => {
    const files = [{ fileId: CARD, mediaType: "image/png", name: "Card.png" }];
    const read = vi.fn(() => Promise.resolve({ stream: stream("bytes!"), size: 6, contentType: "image/png" }));
    for (const stored of [
      details(CARD, { mimeType: "application/pdf" }),
      details(CARD, { size: AGENT_NATIVE_FILE_MAX_BYTES + 1 }),
    ]) {
      const loader = new AgentNativeFileLoader({ readable: () => Promise.resolve(stored) }, () => ({ read }) as never);
      const [user] = await loader.load([{ role: "user", text: "Read it", files }]);
      expect(user.files).toEqual([]);
    }
    expect(read).not.toHaveBeenCalled();
  });
});
