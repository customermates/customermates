import { describe, expect, it } from "vitest";

import { attachmentSubtitle, formatBytes } from "../attachment-classify";

const german = (value: number | undefined, options?: { maximumFractionDigits?: number }) =>
  new Intl.NumberFormat("de-DE", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(value ?? 0);

describe("attachment size formatting", () => {
  it("routes the fraction through the supplied formatter", () => {
    expect(formatBytes(8_596_329, german)).toBe("8,2 MB");
    expect(formatBytes(1_852_807, german)).toBe("1,8 MB");
  });

  it("leaves whole units alone, where no separator is involved", () => {
    expect(formatBytes(15 * 1024 * 1024, german)).toBe("15 MB");
    expect(formatBytes(2048, german)).toBe("2 KB");
  });

  it("keeps the previous output when no formatter is supplied", () => {
    expect(formatBytes(8_596_329)).toBe("8.2 MB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15 MB");
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(null)).toBeNull();
  });

  it("threads the formatter through the subtitle a message actually renders", () => {
    const t = (key: string) => key;
    const input = { mime: "application/pdf", fileName: "invoice.pdf", size: 8_596_329 };

    expect(attachmentSubtitle(t, input, german)).toBe("Inbox.fileTypePdf · 8,2 MB");
    expect(attachmentSubtitle(t, input)).toBe("Inbox.fileTypePdf · 8.2 MB");
  });
});
