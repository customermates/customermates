import type { StartChatContactRepo } from "@/ee/messaging/outbound/start-chat.interactor";
import type { RepoArgs } from "@/core/utils/types";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { MutateRecordInteractor } from "./mutate-record.interactor";
import { BaseRepository } from "@/core/base/base-repository";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { channelClass } from "@/ee/messaging/provider";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { RecordIdentityReader } from "./record-identity-reader";

export class StartChatRecordChannelRepo extends BaseRepository implements StartChatContactRepo {
  constructor(
    private records: RecordRepo,
    private access: RecordAccessPolicy,
    _mutate: MutateRecordInteractor,
  ) {
    super();
  }

  findContactChannelCompanyWide(args: RepoArgs<StartChatContactRepo, "findContactChannelCompanyWide">) {
    return runInTransaction(
      async () => {
        const value = identityLookupValue(args.provider, args.identifier);
        if (!value) return null;
        const matches = await new RecordIdentityReader(this.records, this.access).resolve([
          { provider: args.provider, value },
        ]);
        const ids = new Set(
          matches.flatMap((match) => match.records.flatMap((record) => (record.identityId ? [record.identityId] : []))),
        );
        if (ids.size !== 1) return null;
        const row = (
          await this.records.getIdentityChannelsCompanyWide([{ channelClass: channelClass(args.provider), value }])
        ).find((row) => ids.has(row.id));
        return row
          ? {
              id: row.id,
              messagingId: row.messagingId,
              displayName: row.displayName,
              profileUrl: row.profileUrl,
            }
          : null;
      },
      { readOnly: true },
    );
  }

  async saveResolvedContactChannel(args: RepoArgs<StartChatContactRepo, "saveResolvedContactChannel">) {
    await runInTransaction(async () => {
      if ((await this.records.getState())?.activeOperationId) return;
      const row = await this.prisma.recordIdentity.findUnique({
        where: {
          companyId: this.companyId,
          companyId_id: { companyId: this.companyId, id: args.id },
        },
      });
      if (!row) return;
      const matches = await new RecordIdentityReader(this.records, this.access).resolve([
        { provider: row.provider, value: row.value },
      ]);
      let editable = false;
      for (const reference of matches.flatMap((match) => match.records)) {
        if (!reference.canEdit) continue;
        const record = await this.records.getRecordCompanyWide(reference.ref);
        if (record && !record.protectedKind) {
          editable = true;
          break;
        }
      }
      if (!editable) return;
      await this.records.setIdentityResolutionCompanyWide(args.id, {
        messagingId: args.messagingId,
        displayName: args.displayName ?? row.displayName,
        profileUrl: args.profileUrl ?? row.profileUrl,
      });
    });
  }
}
