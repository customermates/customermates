import type { GetContactByIdInteractor } from "../get/get-contact-by-id.interactor";
import type { UpdateContactInteractor } from "./update-contact.interactor";
import type { UnlinkContactIdentifierData } from "./contact-identifier";
import type { ContactDto } from "../contact.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ContactDtoSchema } from "../contact.schema";
import { identifiersExcept, UnlinkContactIdentifierSchema } from "./contact-identifier";

@TenantInteractor({ resource: Resource.contacts, action: Action.update })
export class UnlinkContactIdentifierInteractor extends AuthenticatedInteractor<
  UnlinkContactIdentifierData,
  ContactDto
> {
  constructor(
    private readonly getContact: GetContactByIdInteractor,
    private readonly updateContact: UpdateContactInteractor,
  ) {
    super();
  }

  @Write({ input: UnlinkContactIdentifierSchema, output: ContactDtoSchema })
  async invoke(data: UnlinkContactIdentifierData): Validated<ContactDto> {
    const result = await this.getContact.invoke({ id: data.contactId });
    if (!result.ok) return result;
    const contact = result.data.contact;
    if (!contact) return failNotFound(CustomErrorCode.contactNotFound, ["contactId"]);

    return await this.updateContact.invoke({
      id: data.contactId,
      identifiers: identifiersExcept(contact, data.provider, data.identifier),
    });
  }
}
