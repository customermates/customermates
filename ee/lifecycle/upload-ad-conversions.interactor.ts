import type { AdConversionUploader } from "@/ee/operator/ad-conversion-uploader";
import type { AdConversionUploadDto } from "@/ee/operator/ad-conversion-upload.schema";

import * as ErrorReporter from "@/core/observability/server";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const REPORT_TAGS = { kind: "lifecycle-step", step: "uploadAdConversions" } as const;

@SystemInteractor
export class UploadAdConversionsSystemInteractor {
  constructor(private readonly uploader: AdConversionUploader) {}

  async invoke(): Promise<AdConversionUploadDto | null> {
    try {
      const outcome = await this.uploader.upload("cron");
      if (!outcome.ok) {
        ErrorReporter.captureMessage("Daily ad conversion upload could not run", {
          level: "warning",
          tags: REPORT_TAGS,
        });
        return null;
      }

      const upload = outcome.data;
      const failedBatch = upload.batches.find((batch) => batch.result !== "submitted");
      if (upload.status === "authorizationFailed" || upload.status === "unavailable" || failedBatch) {
        ErrorReporter.captureMessage("Daily ad conversion upload did not reach Google cleanly", {
          level: "warning",
          tags: { ...REPORT_TAGS, status: upload.status, batchResult: failedBatch?.result, mode: upload.mode ?? "" },
        });
      }
      return upload;
    } catch (error) {
      ErrorReporter.captureException(error, { tags: REPORT_TAGS });
      return null;
    }
  }
}
