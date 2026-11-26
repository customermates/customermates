import type { AdConversionUploader } from "./ad-conversion-uploader";
import type { AdConversionUploadDto } from "./ad-conversion-upload.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AdConversionUploadDtoSchema } from "./ad-conversion-upload.schema";

@OperatorInteractor
export class UploadAdConversionsInteractor {
  constructor(private readonly uploader: AdConversionUploader) {}

  @ValidateOutput(AdConversionUploadDtoSchema)
  async invoke(): Validated<AdConversionUploadDto> {
    return this.uploader.upload("operator");
  }
}
