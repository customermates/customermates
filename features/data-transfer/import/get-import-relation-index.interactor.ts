import type { GetImportRelationIndexData, RelationIndexResult } from "../data-transfer.schema";
import type { ImportRelationIndex } from "./relation-index.service";
import type { UserService } from "@/features/user/user.service";
import type { Validated } from "@/core/validation/validation.utils";

import { Action, EntityType, Resource } from "@/generated/prisma";

import { GetImportRelationIndexSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const READ_RESOURCE: Record<EntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
  [EntityType.deal]: Resource.deals,
  [EntityType.service]: Resource.services,
  [EntityType.task]: Resource.tasks,
};

@TenantInteractor()
export class GetImportRelationIndexInteractor extends AuthenticatedInteractor<
  GetImportRelationIndexData,
  RelationIndexResult
> {
  constructor(
    private index: ImportRelationIndex,
    private userService: UserService,
  ) {
    super();
  }

  @Validate(GetImportRelationIndexSchema)
  async invoke(data: GetImportRelationIndexData): Validated<RelationIndexResult> {
    for (const entityType of data.entityTypes) await this.assertReadable(entityType);

    return { ok: true as const, data: await this.index.build(data.entityTypes, data.includeUsers ?? false) };
  }

  private async assertReadable(entityType: EntityType) {
    const resource = READ_RESOURCE[entityType];

    if (await this.userService.hasPermission(resource, Action.readAll)) return;

    await this.userService.hasPermissionOrThrow(resource, Action.readOwn);
  }
}
