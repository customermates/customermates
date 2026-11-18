import type { Validated } from "@/core/validation/validation.utils";
import type { BrandLogoWrite, WorkspaceBrandRepo } from "./workspace-brand.repo";
import type { SaveWorkspaceBrandData, WorkspaceBrand } from "./workspace-brand.schema";

import { randomBytes } from "node:crypto";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { BRAND_LOGO_MAX_BYTES, sniffBrandLogoType } from "./brand-image";
import { SaveWorkspaceBrandSchema, WorkspaceBrandSchema, publicBrand } from "./workspace-brand.schema";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class SaveWorkspaceBrandInteractor extends AuthenticatedInteractor<SaveWorkspaceBrandData, WorkspaceBrand> {
  constructor(private readonly repo: Pick<WorkspaceBrandRepo, "save">) {
    super();
  }

  @Write({ input: SaveWorkspaceBrandSchema, output: WorkspaceBrandSchema })
  async invoke(data: SaveWorkspaceBrandData): Validated<WorkspaceBrand> {
    let logo: BrandLogoWrite | null | undefined = data.logo === null ? null : undefined;

    if (typeof data.logo === "string") {
      const bytes = new Uint8Array(Buffer.from(data.logo, "base64"));
      if (bytes.length > BRAND_LOGO_MAX_BYTES)
        return fail(CustomErrorCode.recordFileTooLarge, ["logo"], { limit: "512 KB" });
      const type = sniffBrandLogoType(bytes);
      if (!type) return fail(CustomErrorCode.recordFileContentInvalid, ["logo"]);
      logo = { bytes, type, key: randomBytes(24).toString("base64url") };
    }

    const saved = await this.repo.save({
      ...(data.accentColor === undefined ? {} : { accentColor: data.accentColor }),
      ...(logo === undefined ? {} : { logo }),
    });

    return { ok: true as const, data: publicBrand(saved) ?? { accentColor: null, logoUrl: null } };
  }
}
