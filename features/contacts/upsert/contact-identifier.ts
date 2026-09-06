import type { MessagingProvider } from "@/generated/prisma";
import type { ContactDto, IdentifierInput } from "../contact.schema";
import type { Data } from "@/core/validation/validation.utils";

import { channelClass } from "@/ee/messaging/provider";
import { IdentifierInputSchema } from "../contact.schema";
import { ContactKeySchema } from "../contact-key";

export const LinkContactIdentifierSchema = IdentifierInputSchema.pick({
  provider: true,
  displayName: true,
  profileUrl: true,
}).extend({ contactId: ContactKeySchema, identifier: IdentifierInputSchema.shape.value });
export type LinkContactIdentifierData = Data<typeof LinkContactIdentifierSchema>;
export const UnlinkContactIdentifierSchema = LinkContactIdentifierSchema.pick({
  contactId: true,
  provider: true,
  identifier: true,
});
export type UnlinkContactIdentifierData = Data<typeof UnlinkContactIdentifierSchema>;

export function identifiersExcept(contact: ContactDto, provider: MessagingProvider, value: string): IdentifierInput[] {
  const targetClass = channelClass(provider);
  return contact.identifiers
    .filter(
      (dto) => !(channelClass(dto.provider) === targetClass && (dto.value === value || dto.messagingId === value)),
    )
    .map((dto) => ({
      provider: dto.provider,
      value: dto.value,
      messagingId: dto.messagingId ?? undefined,
      displayName: dto.displayName ?? undefined,
      profileUrl: dto.profileUrl ?? undefined,
    }));
}
