import type { MessagingProvider } from "@/generated/prisma";

export abstract class StartChatContactRepo {
  abstract findContactChannelCompanyWide(args: {
    provider: MessagingProvider;
    identifier: string;
  }): Promise<{ id: string; messagingId: string | null; displayName: string | null; profileUrl: string | null } | null>;
  abstract saveResolvedContactChannel(args: {
    id: string;
    messagingId: string;
    displayName: string | null;
    profileUrl: string | null;
  }): Promise<void>;
}
