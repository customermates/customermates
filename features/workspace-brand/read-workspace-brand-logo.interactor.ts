import type { StoredBrandLogo, WorkspaceBrandRepo } from "./workspace-brand.repo";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { BRAND_LOGO_KEY } from "./workspace-brand.schema";

@AllowInDemoMode
@SystemInteractor
export class ReadWorkspaceBrandLogoInteractor {
  constructor(private readonly repo: Pick<WorkspaceBrandRepo, "findLogoByKeyUnscoped">) {}

  async invoke(input: { key: string }): Promise<StoredBrandLogo | null> {
    if (typeof input.key !== "string" || !BRAND_LOGO_KEY.test(input.key)) return null;

    return this.repo.findLogoByKeyUnscoped(input.key);
  }
}
