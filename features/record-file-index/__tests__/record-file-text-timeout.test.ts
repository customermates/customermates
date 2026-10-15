import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("unpdf", () => ({
  getDocumentProxy: () => new Promise(() => undefined),
  extractText: () => new Promise(() => undefined),
}));

import { extractRecordFileText, RECORD_FILE_TEXT_TIMEOUT_MS } from "../record-file-text";

afterEach(() => {
  vi.useRealTimers();
});

describe("record file text extraction time limit", () => {
  it("gives up on a file whose extraction does not finish in time", async () => {
    vi.useFakeTimers();
    const extraction = extractRecordFileText(new Uint8Array([37, 80, 68, 70]), "pdf");
    const outcome = expect(extraction).rejects.toThrow(
      `Text extraction took longer than ${RECORD_FILE_TEXT_TIMEOUT_MS} ms`,
    );
    await vi.advanceTimersByTimeAsync(RECORD_FILE_TEXT_TIMEOUT_MS);
    await outcome;
  });
});
