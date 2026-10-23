import type { MessagingProvider, RecordIdentityProvider } from "@/generated/prisma";
import type { ProviderAvatars } from "./inbound-avatar";

import { identityLookupValue } from "../identity-lookup";

export type KnownIdentity = { provider: RecordIdentityProvider; value: string; messagingId?: string | null };

function pictureProvider(provider: RecordIdentityProvider): MessagingProvider {
  return provider === "phone" ? "whatsapp" : provider;
}

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
    const provider = pictureProvider(identity.provider);
    const lookup = identityLookupValue(provider, identity.value);
    if (!lookup) continue;
    const pictureUrl = await pictures.findLatestParticipantPictureUnscoped(
      companyId,
      provider,
      lookup,
      identity.messagingId ?? null,
    );
    if (pictureUrl) await avatars(companyId).synchronize(provider, identity.value, pictureUrl);
  }
}
