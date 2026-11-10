import { describe, expect, it, vi } from "vitest";

import { failureUnwindCause } from "@/core/validation/failure-unwind";

import { RecordFileQuotaService } from "../record-file-quota.service";
import { RecordFileUploadService } from "../record-file-upload.service";

const GIB = 1024 ** 3;

async function refusal(plan: "free" | "starter" | "business" | "max" | "enterprise", locale = "en") {
  const quota = new RecordFileQuotaService(
    {
      subscription: () => Promise.resolve({ plan, enterpriseFileStorageBytesPerUser: null }),
      activeUsers: () => Promise.resolve(1),
      usedBytes: () => Promise.resolve(100 * GIB),
    },
    "cloud",
  );
  const service = new RecordFileUploadService(
    {} as never,
    { load: () => Promise.resolve({ actor: { id: "user" } }) } as never,
    { createPendingFile: vi.fn() } as never,
    quota,
    { maxBytes: 10 * GIB, driver: "database" },
  );
  const error = await service
    .reserveChatFile({ name: "Offer.pdf", size: 1024, mimeType: "application/pdf" }, locale)
    .then(
      () => null,
      (caught: unknown) => caught,
    );
  return failureUnwindCause(error);
}

describe("a full file storage", () => {
  it("names the next plan with more storage and what it includes per user", async () => {
    expect(await refusal("free")).toMatchObject({
      code: "storageQuotaExceeded",
      failureKind: "conflict",
      values: { plan: "Starter", size: "1 GB" },
    });
    expect(await refusal("starter")).toMatchObject({
      code: "storageQuotaExceeded",
      values: { plan: "Pro", size: "5 GB" },
    });
    expect(await refusal("business")).toMatchObject({ values: { plan: "Max", size: "50 GB" } });
  });

  it("tells the top plan and a contract to contact support", async () => {
    expect(await refusal("max")).toMatchObject({ code: "storageQuotaExceededTopPlan" });
    expect(await refusal("enterprise")).toMatchObject({ code: "storageQuotaExceededTopPlan" });
  });

  it("formats the sizes for the person's language", async () => {
    expect(await refusal("starter", "de")).toMatchObject({ values: { plan: "Pro", size: "5 GB" } });
  });
});
