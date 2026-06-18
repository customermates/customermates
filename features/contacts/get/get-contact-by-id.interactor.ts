import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type ContactDto, ContactByIdResponseSchema } from "../contact.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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
@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactByIdInteractor extends AuthenticatedInteractor<
  GetContactByIdData,
  { contact: ContactDto | null; customColumns: CustomColumnDto[] }
> {
  constructor(
    private repo: GetContactByIdRepo,
    private customColumnsRepo: ContactCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetContactByIdSchema)
  @ValidateOutput(ContactByIdResponseSchema)
  async invoke(data: GetContactByIdData): Validated<{ contact: ContactDto | null; customColumns: CustomColumnDto[] }> {
    const [contact, customColumns] = await Promise.all([
      this.repo.getContactById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.contact),
    ]);

    return { ok: true as const, data: { contact, customColumns } };
  }
}
