import { randomUUID } from "node:crypto";
import type { StartChatContactRepo } from "@/ee/messaging/outbound/start-chat.interactor";
import type { RepoArgs } from "@/core/utils/types";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { MutateRecordInteractor } from "./mutate-record.interactor";
import { BaseRepository } from "@/core/base/base-repository";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { channelClass } from "@/ee/messaging/provider";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";

export class StartChatRecordChannelRepo extends BaseRepository implements StartChatContactRepo {
  constructor(
    private records: RecordRepo,
    private access: RecordAccessPolicy,
    private mutate: MutateRecordInteractor,
  ) {
    super();
  }

  findContactChannelCompanyWide(args: RepoArgs<StartChatContactRepo, "findContactChannelCompanyWide">) {
    return runInTransaction(
      async () => {
        const value = identityLookupValue(args.provider, args.identifier);
        if (!value) return null;
        const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
        const bound = model.capabilities
          .filter((binding) => binding.kind === "personIdentity")
          .map((binding) => binding.typeId);
        const row = await this.prisma.recordIdentity.findFirst({
          where: {
            companyId: this.companyId,
            typeId: { in: bound },
            keys: { some: { companyId: this.companyId, channelClass: channelClass(args.provider), value } },
          },
        });
        if (!row) return null;
        const ref = { typeId: row.typeId, recordId: row.recordId };
        if (!(await this.records.searchRecords({ refs: [ref] }, model, policy.access(bound))).length) return null;
        return { id: row.id, messagingId: row.messagingId, displayName: row.displayName, profileUrl: row.profileUrl };
      },
      { readOnly: true },
    );
  }

  async saveResolvedContactChannel(args: RepoArgs<StartChatContactRepo, "saveResolvedContactChannel">) {
    await runInTransaction(async () => {
      const [state, model, policy] = await Promise.all([
        this.records.getState(),
        this.records.getModel(),
        this.access.load(),
      ]);
      if (state?.activeOperationId) return;
      const row = await this.prisma.recordIdentity.findFirst({ where: { companyId: this.companyId, id: args.id } });
      if (
        !row ||
        !model.capabilities.some((binding) => binding.kind === "personIdentity" && binding.typeId === row.typeId)
      )
        return;
      const ref = { typeId: row.typeId, recordId: row.recordId };
      const record = await this.records.getRecordCompanyWide(ref);
      if (!record || !policy.allowed(row.typeId, "update") || !(await policy.canRead(record))) return;
      const identities = await this.records.getIdentitiesCompanyWide(ref);
      const result = await this.mutate.invoke({
        expectedRevision: model.revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "update",
          ref,
          expectedVersion: record.version,
          fields: [],
          identities: identities.map((identity) => ({
            provider: identity.provider,
            value: identity.value,
            messagingId: identity.messagingId,
            displayName: identity.displayName,
            profileUrl: identity.profileUrl,
            ...(identity.id === args.id
              ? {
                  messagingId: args.messagingId,
                  displayName: args.displayName ?? identity.displayName,
                  profileUrl: args.profileUrl ?? identity.profileUrl,
                }
              : {}),
          })),
        },
      });
      if (!result.ok) throw new Error("Resolved provider identity could not be saved");
    });
  }
}
