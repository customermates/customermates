import type { MessagingProvider } from "@/generated/prisma";

export type InboundSender = { provider: MessagingProvider; identifier: string | null; pictureUrl: string };

export type ProviderAvatars = (companyId: string) => {
  synchronize(provider: MessagingProvider, identifier: string | null, pictureUrl: string): Promise<unknown>;
};

export async function synchronizeInboundAvatar(avatars: ProviderAvatars, companyId: string, ingested: unknown) {
  const sender =
    ingested && typeof ingested === "object" && "inboundSender" in ingested
      ? (ingested as { inboundSender?: InboundSender }).inboundSender
      : undefined;
  if (sender) await avatars(companyId).synchronize(sender.provider, sender.identifier, sender.pictureUrl);
}
