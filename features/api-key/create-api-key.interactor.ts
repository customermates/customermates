import type { ApiKey } from "./get-api-keys.interactor";
import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { ApiKeyDtoSchema } from "./get-api-keys.interactor";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { BaseInteractor } from "@/core/base/base-interactor";

const CreateApiKeyResultSchema = ApiKeyDtoSchema.extend({
  key: z.string(),
});

const MAX_EXPIRATION_SECONDS = 365 * 24 * 60 * 60;

const Schema = z
  .object({
    name: z.string().min(1),
    expiresIn: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.expiresIn !== undefined && data.expiresIn > MAX_EXPIRATION_SECONDS) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.apiKeyMaxExpiration },
        path: ["expiresIn"],
      });
    }
  });

export type CreateApiKeyData = Data<typeof Schema>;

export type CreateApiKeyResult = ApiKey & { key: string };

@TentantInteractor({ resource: Resource.api, action: Action.create })
export class CreateApiKeyInteractor extends BaseInteractor<CreateApiKeyData, CreateApiKeyResult> {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(CreateApiKeyResultSchema)
  async invoke(data: CreateApiKeyData): Validated<CreateApiKeyResult> {
    const result = await this.authService.createApiKey({
      name: data.name,
      expiresIn: data.expiresIn,
    });

    return {
      ok: true,
      data: {
        id: result.id,
        key: result.key,
        name: result.name,
        createdAt: result.createdAt,
        expiresAt: result.expiresAt,
        lastRequest: result.lastRequest,
      },
    };
  }
}
