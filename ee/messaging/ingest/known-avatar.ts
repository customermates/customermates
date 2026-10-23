import type { MessagingProvider } from "@/generated/prisma";
import type { ProviderAvatars } from "./inbound-avatar";

import { identityLookupValue } from "../identity-lookup";

export type KnownIdentity = { provider: MessagingProvider; value: string; messagingId?: string | null };

export type KnownPictures = {
  findLatestParticipantPictureUnscoped(
    companyId: string,
    provider: MessagingProvider,
    lookupValue: string,
    providerUserId: string | null,
  ): Promise<string | null>;
};

export async function synchronizeKnownAvatars(
  avatars: ProviderAvatars,
  pictures: KnownPictures,
  companyId: string,
  identities: KnownIdentity[],
) {
  for (const identity of identities) {
    const lookup = identityLookupValue(identity.provider, identity.value);
    if (!lookup) continue;
    const pictureUrl = await pictures.findLatestParticipantPictureUnscoped(
      companyId,
      identity.provider,
      lookup,
      identity.messagingId ?? null,
    );
    if (pictureUrl) await avatars(companyId).synchronize(identity.provider, identity.value, pictureUrl);
  }
}
