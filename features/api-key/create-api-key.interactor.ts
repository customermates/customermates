import { fail } from "@/core/validation/interactor-failure-server";
import type { ApiKey } from "./get-api-keys.interactor";
import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { ApiKeyDtoSchema } from "./get-api-keys.interactor";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { API_KEY_MAX_EXPIRATION_SECONDS, API_KEY_MIN_EXPIRATION_SECONDS } from "./api-key-expiration";

const OutputSchema = ApiKeyDtoSchema.extend({
  key: z.string(),
});

export const CreateApiKeySchema = z
  .object({
    name: z.string().min(1).max(255),
    expiresIn: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.expiresIn !== undefined && data.expiresIn < API_KEY_MIN_EXPIRATION_SECONDS) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.apiKeyMinExpiration },
        path: ["expiresIn"],
      });
    }

    if (data.expiresIn !== undefined && data.expiresIn > API_KEY_MAX_EXPIRATION_SECONDS) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.apiKeyMaxExpiration },
        path: ["expiresIn"],
      });
    }
  });

export type CreateApiKeyData = Data<typeof CreateApiKeySchema>;

type CreateApiKeyResult = ApiKey & { key: string };

@TenantInteractor({ resource: Resource.api, action: Action.create })
export class CreateApiKeyInteractor extends AuthenticatedInteractor<CreateApiKeyData, CreateApiKeyResult> {
  constructor(private readonly authService: AuthService) {
    super();
  }

  @Validate(CreateApiKeySchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: CreateApiKeyData): Validated<CreateApiKeyResult> {
    const result = await this.authService.createApiKey({
      name: data.name,
      expiresIn: data.expiresIn,
    });

    if (!result.ok) return fail(result.error, ["expiresIn"]);

    const created = result.data;

    return {
      ok: true,
      data: {
        id: created.id,
        key: created.key,
        name: created.name,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        lastRequest: created.lastRequest,
      },
    };
  }
}
