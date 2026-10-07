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
export type IdentityMatch = IdentityLookup & {
  records: RecordIdentityReference[];
  moreRecords?: true;
};
type VersionedIdentityReference = RecordIdentityReference & { version: number };
export type VersionedIdentityMatch = IdentityLookup & {
  records: VersionedIdentityReference[];
  moreRecords?: true;
};

export const IDENTITY_MATCH_DISPLAY_LIMIT = 20;

export function identityReference(
  row: RecordSearchRow,
  model: RecordModel,
  canEdit = false,
  identityId?: string,
): RecordIdentityReference {
  const type = model.types.find((type) => type.id === row.typeId);
  return {
    ref: { typeId: row.typeId, recordId: row.recordId },
    ...(identityId ? { identityId } : {}),
    typeLabel: type?.label ?? "",
    typePluralLabel: type?.pluralLabel ?? "",
    title: row.state === "value" && row.title ? row.title : (type?.label ?? ""),
    avatarUrl: row.pictureUrl,
    canEdit: canEdit && !row.protectedKind,
  };
}

export class RecordIdentityReader {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {}

  async resolve(
    identifiers: IdentityLookup[],
    typeIds?: string[],
    options: { complete?: boolean } = {},
  ): Promise<IdentityMatch[]> {
    if (!identifiers.length) return [];
    return (await this.lookup(identifiers, typeIds, options)).matches.map((match) => ({
      ...match,
      records: match.records.map(({ version: _version, ...record }) => record),
    }));
  }

  async resolveForUpdate(
    identifiers: IdentityLookup[],
    typeIds?: string[],
  ): Promise<{ schemaRevision: number; matches: VersionedIdentityMatch[] }> {
    const { revision, matches } = await this.lookup(identifiers, typeIds, { complete: true });
    return { schemaRevision: revision, matches };
  }

  private async lookup(
    identifiers: IdentityLookup[],
    typeIds: string[] | undefined,
    options: { complete?: boolean },
  ): Promise<{ revision: number; matches: VersionedIdentityMatch[] }> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) {
          return {
            revision: model.revision,
            matches: identifiers.map((identifier) => ({
              ...identifier,
              records: [],
            })),
          };
        }
        const bound = new Set(
          model.capabilities
            .filter(
              (binding) =>
                binding.kind === "channels" &&
                binding.enabled !== false &&
                (!typeIds || typeIds.includes(binding.typeId)) &&
                model.types.some((type) => type.id === binding.typeId && !type.archived),
            )
            .map((binding) => binding.typeId),
        );
        const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
        const matches: VersionedIdentityMatch[] = [];
        for (let offset = 0; offset < identifiers.length; offset += 500) {
          const batch = identifiers.slice(offset, offset + 500);
          const keys = batch.map((input) => ({
            channelClass: channelClass(input.provider),
            value: identityLookupValue(input.provider, input.value) ?? "",
          }));
          const owners: Awaited<ReturnType<RecordRepo["getIdentityOwnersCompanyWide"]>> = [];
          const truncated = new Set<string>();
          const counts = new Map<string, number>();
          for (const owner of await this.records.getIdentityOwnersCompanyWide(keys, [...bound], {
            access,
            ...(options.complete ? {} : { limitPerKey: IDENTITY_MATCH_DISPLAY_LIMIT }),
          })) {
            if (!bound.has(owner.ref.typeId)) continue;
            const key = JSON.stringify([owner.channelClass, owner.value]);
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            if (!options.complete && count > IDENTITY_MATCH_DISPLAY_LIMIT) truncated.add(key);
            else owners.push(owner);
          }
          const refs = [...new Map(owners.map((owner) => [recordKey(owner.ref), owner.ref])).values()];
          const readable = new Map<string, RecordSearchRow>();
          for (let index = 0; index < refs.length; index += 100) {
            const rows = await this.records.searchRecords({ refs: refs.slice(index, index + 100) }, model, access);
            for (const row of rows) readable.set(recordKey(row), row);
          }
          const byKey = new Map<string, VersionedIdentityReference[]>();
          for (const owner of owners) {
            const row = readable.get(recordKey(owner.ref));
            if (!row) continue;
            const key = JSON.stringify([owner.channelClass, owner.value]);
            const records = byKey.get(key) ?? [];
            if (!records.some((record) => recordKey(record.ref) === recordKey(owner.ref))) {
              records.push({
                ...identityReference(row, model, policy.allowed(row.typeId, "update"), owner.identityId),
                version: row.version,
              });
            }
            byKey.set(key, records);
          }
          batch.forEach((identifier, index) => {
            const key = JSON.stringify([keys[index].channelClass, keys[index].value]);
            const records = [...(byKey.get(key) ?? [])].sort((left, right) =>
              recordKey(left.ref) < recordKey(right.ref) ? -1 : recordKey(left.ref) > recordKey(right.ref) ? 1 : 0,
            );
            matches.push({ ...identifier, records, ...(truncated.has(key) ? { moreRecords: true as const } : {}) });
          });
        }
        return { revision: model.revision, matches };
      },
      { readOnly: true },
    );
  }
}
