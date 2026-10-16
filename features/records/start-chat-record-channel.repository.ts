import type { MessagingProvider, RecordIdentityProvider } from "@/generated/prisma";
import type { StartChatContactChannel, StartChatContactRepo } from "@/ee/messaging/outbound/start-chat-contact.repo";
import type { RecordRepo } from "./record.repo";
import type { RecordRef } from "./record-model.schema";
import { TenantRepository } from "@/core/base/tenant-repository";
import { channelClass } from "@/ee/messaging/provider";

export class StartChatRecordChannelRepo extends TenantRepository implements StartChatContactRepo {
  constructor(private records: RecordRepo) {
    super();
  }

  async findIdentityChannelsCompanyWide(
    provider: MessagingProvider,
    value: string,
  ): Promise<StartChatContactChannel[]> {
    const rows = await this.records.getIdentityChannelsCompanyWide([{ channelClass: channelClass(provider), value }]);
    return rows.map((row) => ({
      id: row.id,
      messagingId: row.messagingId,
      displayName: row.displayName,
      profileUrl: row.profileUrl,
    }));
  }

  findIdentityCompanyWide(id: string): Promise<{ provider: RecordIdentityProvider; value: string } | null> {
    return this.records.getIdentityProviderValueCompanyWide(id);
  }

  async isRecordWritePaused(): Promise<boolean> {
    return Boolean((await this.records.getState())?.activeOperationId);
  }

  async isRecordEditableCompanyWide(ref: RecordRef): Promise<boolean> {
    const record = await this.records.getRecordCompanyWide(ref);
    return Boolean(record && !record.protectedKind);
  }

  setIdentityResolutionCompanyWide(
    id: string,
    resolution: { messagingId: string; displayName: string | null; profileUrl: string | null },
  ): Promise<void> {
    return this.records.setIdentityResolutionCompanyWide(id, resolution);
  }
}
