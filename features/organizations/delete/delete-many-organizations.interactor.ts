import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindOrganizationsByIdsRepo } from "../find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";

import { DeleteOrganizationRepo } from "./delete-organization.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteManyOrganizationsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const organizationSet = new Set(data.ids);
    const validIdsSet = await preserveTenantContext(() => di.get(FindOrganizationsByIdsRepo).findIds(organizationSet));
    validateOrganizationIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyOrganizationsData = Data<typeof DeleteManyOrganizationsSchema>;

@TentantInteractor({ resource: Resource.organizations, action: Action.delete })
export class DeleteManyOrganizationsInteractor {
  constructor(
    private repo: DeleteOrganizationRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteManyOrganizationsSchema)
  @Transaction
  async invoke(data: DeleteManyOrganizationsData): Validated<string[], DeleteManyOrganizationsData> {
    const organizations = await Promise.all(data.ids.map((id) => this.repo.deleteOrganizationOrThrow(id)));

    await Promise.all([
      ...organizations.map((organization) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_DELETED, {
          entityId: organization.id,
          payload: organization,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.ids };
  }
}
