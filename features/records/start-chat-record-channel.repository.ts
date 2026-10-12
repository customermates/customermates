import type { MessagingProvider } from "@/generated/prisma";
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

  findIdentityCompanyWide(id: string): Promise<{ provider: MessagingProvider; value: string } | null> {
    return this.prisma.recordIdentity.findUnique({
      where: { companyId: this.companyId, companyId_id: { companyId: this.companyId, id } },
      select: { provider: true, value: true },
    });
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
