import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { DownloadRecordFile } from "./record-file.schema";
import type { RecordFileAccessService } from "./record-file-access.service";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DownloadRecordFileSchema } from "./record-file.schema";
import { parseRecordFileRange, recordFileResponseHeaders, recordFileServedInline } from "./record-file-response";

export type RecordFileDownload = {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
};

@AllowInDemoMode
@TenantInteractor()
export class DownloadRecordFileInteractor extends AuthenticatedInteractor<DownloadRecordFile, RecordFileDownload> {
  constructor(
    private access: RecordFileAccessService,
    private drivers: FileStorageDrivers,
  ) {
    super();
  }

  @Validate(DownloadRecordFileSchema)
  async invoke({ fileId, range, download }: DownloadRecordFile): Validated<RecordFileDownload> {
    const readable = await runInTransaction(
      async () => ({ ok: true as const, data: await this.access.readable(fileId) }),
      { readOnly: true },
    ).catch(unwoundFailure);
    if (!readable.ok) return readable;
    const file = readable.data;
    const requested = parseRecordFileRange(range ?? null, file.size);
    if (requested === "unsatisfiable") {
      return {
        ok: true,
        data: {
          status: 416,
          headers: { "content-range": `bytes */${file.size}`, "cache-control": "private, no-store" },
          body: null,
        },
      };
    }
    const stored = await this.drivers(file.storageDriver).read(file.storageKey, requested ?? undefined);
    if (!stored) return failNotFound(CustomErrorCode.recordFileNotFound, ["fileId"]);
    return {
      ok: true,
      data: {
        status: requested ? 206 : 200,
        headers: recordFileResponseHeaders({
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          inline: recordFileServedInline(file.mimeType, download === true),
          range: requested,
        }),
        body: stored.stream,
      },
    };
  }
}
