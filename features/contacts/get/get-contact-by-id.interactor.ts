import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type ContactDto } from "../contact.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";

export const GetContactByIdSchema = z.object({
  id: z.uuid(),
});
export type GetContactByIdData = Data<typeof GetContactByIdSchema>;

export abstract class GetContactByIdRepo {
  abstract getContactById(id: string): Promise<ContactDto | null>;
}

export abstract class ContactCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactByIdInteractor {
  constructor(
    private repo: GetContactByIdRepo,
    private customColumnsRepo: ContactCustomColumnRepo,
  ) {}

  @Validate(GetContactByIdSchema)
  async invoke(data: GetContactByIdData): Validated<
    {
      contact: ContactDto | null;
      customColumns: CustomColumnDto[];
    },
    GetContactByIdData
  > {
    const [contact, customColumns] = await Promise.all([
      this.repo.getContactById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.contact),
    ]);

    return { ok: true, data: { contact, customColumns } };
  }
}
