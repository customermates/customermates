import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { FindContactsByIdsRepo } from "../find-contacts-by-ids.repo";
import { validateContactIds } from "../validate-contact-ids";

import { DeleteContactRepo } from "./delete-contact.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteContactSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const contactSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindContactsByIdsRepo).findIds(contactSet));
    validateContactIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteContactData = Data<typeof DeleteContactSchema>;

@TentantInteractor({ resource: Resource.contacts, action: Action.delete })
export class DeleteContactInteractor {
  constructor(
    private repo: DeleteContactRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteContactSchema)
  async invoke(data: DeleteContactData): Validated<string, DeleteContactData> {
    const contact = await this.repo.deleteContactOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.CONTACT_DELETED, {
        entityId: contact.id,
        payload: contact,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
