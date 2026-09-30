import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordIdentityInput } from "./record-identity.schema";
import type { RecordIdentityReference } from "./record-identity-reference.schema";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { channelClass } from "@/ee/messaging/provider";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { recordKey } from "./record-calculation.service";
import type { RecordSearchRow } from "./record-search-query";
import type { RecordModel } from "./record-model.schema";

export type IdentityLookup = Pick<RecordIdentityInput, "provider" | "value">;
export type IdentityMatch = IdentityLookup & { record: RecordIdentityReference };

export function identityReference(row: RecordSearchRow, model: RecordModel, canEdit = false): RecordIdentityReference {
  return {
    ref: { typeId: row.typeId, recordId: row.recordId },
    title:
      row.state === "value" && row.title
        ? row.title
        : (model.types.find((type) => type.id === row.typeId)?.label ?? ""),
    avatarUrl: row.pictureUrl,
    canEdit,
  };
}

export class RecordIdentityReader {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {}

  async resolve(identifiers: IdentityLookup[]): Promise<IdentityMatch[]> {
    if (!identifiers.length) return [];
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return [];
        const bound = new Set(
          model.capabilities
            .filter(
              (binding) =>
                binding.kind === "personIdentity" &&
                model.types.some((type) => type.id === binding.typeId && !type.archived),
            )
            .map((binding) => binding.typeId),
        );
        const matches: IdentityMatch[] = [];
        for (let offset = 0; offset < identifiers.length; offset += 500) {
          const batch = identifiers.slice(offset, offset + 500);
          const keys = batch.map((input) => ({
            channelClass: channelClass(input.provider),
            value: identityLookupValue(input.provider, input.value) ?? "",
          }));
          const owners = await this.records.getIdentityOwnersCompanyWide(keys);
          const refs = [
            ...new Map(
              owners.filter((owner) => bound.has(owner.ref.typeId)).map((owner) => [recordKey(owner.ref), owner.ref]),
            ).values(),
          ];
          const rows = await this.records.searchRecords({ refs }, model, policy.access([...bound]));
          const readable = new Map(rows.map((row) => [recordKey(row), row]));
          const byIdentity = new Map(
            owners.map((owner) => [JSON.stringify([owner.channelClass, owner.value]), owner.ref]),
          );
          batch.forEach((identifier, index) => {
            const key = keys[index];
            const ref = byIdentity.get(JSON.stringify([key.channelClass, key.value]));
            const row = ref ? readable.get(recordKey(ref)) : null;
            if (row) {
              matches.push({
                ...identifier,
                record: identityReference(row, model, policy.allowed(row.typeId, "update")),
              });
            }
          });
        }
        return matches;
      },
      { readOnly: true },
    );
  }
}
