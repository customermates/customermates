import type { MessagingProvider } from "@/generated/prisma";
import type { RecordRef } from "@/features/records/record-model.schema";

export type StartChatContactChannel = {
  id: string;
  messagingId: string | null;
  displayName: string | null;
  profileUrl: string | null;
};

export abstract class StartChatContactRepo {
  abstract findIdentityChannelsCompanyWide(
    provider: MessagingProvider,
    value: string,
  ): Promise<StartChatContactChannel[]>;
  abstract findIdentityCompanyWide(id: string): Promise<{ provider: MessagingProvider; value: string } | null>;
  abstract isRecordWritePaused(): Promise<boolean>;
  abstract isRecordEditableCompanyWide(ref: RecordRef): Promise<boolean>;
  abstract setIdentityResolutionCompanyWide(
    id: string,
    resolution: { messagingId: string; displayName: string | null; profileUrl: string | null },
  ): Promise<void>;
}
