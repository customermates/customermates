import { describe, expect, it, vi } from "vitest";

import { docxFixture } from "@/tests/helpers/record-file-fixtures";

import {
  extractRecordFileText,
  RECORD_FILE_ZIP_MAX_ENTRIES,
  RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
} from "../record-file-text";

const calls = vi.hoisted(() => ({ checkZip: vi.fn(), parse: vi.fn() }));

vi.mock("../record-file-zip", () => ({ checkRecordFileZip: calls.checkZip }));
vi.mock("../record-file-parser", () => ({ parseRecordFile: calls.parse }));

describe("record file text extraction zip limit", () => {
  it("skips an office file whose parts unpack beyond the limit without parsing it", async () => {
    calls.checkZip.mockResolvedValue("tooLarge");
    const bytes = docxFixture([{ text: "Body" }]);

    await expect(extractRecordFileText(bytes, "docx")).resolves.toEqual({
      status: "skipped",
    });
    expect(calls.checkZip).toHaveBeenCalledWith(bytes, {
      maxEntries: RECORD_FILE_ZIP_MAX_ENTRIES,
      maxUnpackedBytes: RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
    });
    expect(calls.parse).not.toHaveBeenCalled();
  });
});
