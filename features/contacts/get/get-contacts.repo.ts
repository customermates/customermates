import { type ContactDto } from "../contact.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetContactsRepo extends BaseGetRepo<ContactDto> {}
