import { Action, Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthService } from "@/features/auth/auth.service";

export interface ApiKey {
  id: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  lastRequest: Date | null;
}

export abstract class GetApiKeysRepo {
  abstract getCrmApiKeyId(): Promise<string | null>;
}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetApiKeysInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: GetApiKeysRepo,
  ) {}

  async invoke(): Promise<ApiKey[]> {
    const [keys, crmApiKeyId] = await Promise.all([this.authService.listApiKeys(), this.repo.getCrmApiKeyId()]);

    const filtered = crmApiKeyId ? keys.filter((k) => k.id !== crmApiKeyId) : keys;

    return filtered.map((key) => ({
      id: key.id,
      name: key.name,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      lastRequest: key.lastRequest,
    }));
  }
}
