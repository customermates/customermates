import type { RelationIndexEntry, RelationIndexKey, RelationIndexResult } from "../data-transfer.schema";

import { EntityType } from "@/generated/prisma";

import { RELATION_INDEX_LIMIT, RELATION_INDEX_PAGE_SIZE, USER_RELATION_KEY } from "../data-transfer.schema";
import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getOrganizationRepo, getDealRepo, getServiceRepo, getTaskRepo, getUserRepo } from "@/core/di";

type LabelledRecord = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type PageLoader = (skip: number, take: number) => Promise<LabelledRecord[]>;

function relationLabel(record: LabelledRecord): string {
  return record.name ?? `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim();
}

export class ImportRelationIndex extends BaseRepository {
  async build(entityTypes: EntityType[], includeUsers: boolean): Promise<RelationIndexResult> {
    const index: RelationIndexResult["index"] = {};
    const truncated: RelationIndexKey[] = [];

    const sources: Array<[RelationIndexKey, PageLoader]> = entityTypes.map((entityType) => [
      entityType,
      this.loaderFor(entityType),
    ]);

    if (includeUsers) sources.push([USER_RELATION_KEY, this.userLoader()]);

    for (const [key, load] of sources) {
      const page = await this.collect(load);

      index[key] = page.entries;
      if (page.truncated) truncated.push(key);
    }

    return { index, truncated };
  }

  private async collect(load: PageLoader): Promise<{ entries: RelationIndexEntry[]; truncated: boolean }> {
    const entries: RelationIndexEntry[] = [];

    for (let skip = 0; skip < RELATION_INDEX_LIMIT; skip += RELATION_INDEX_PAGE_SIZE) {
      const records = await load(skip, RELATION_INDEX_PAGE_SIZE);

      for (const record of records) entries.push([relationLabel(record).toLocaleLowerCase(), record.id]);

      if (records.length < RELATION_INDEX_PAGE_SIZE) return { entries, truncated: false };
    }

    return { entries, truncated: true };
  }

  private loaderFor(entityType: EntityType): PageLoader {
    switch (entityType) {
      case EntityType.contact:
        return (skip, take) => getContactRepo().exportItems({ skip, take });
      case EntityType.organization:
        return (skip, take) => getOrganizationRepo().exportItems({ skip, take });
      case EntityType.deal:
        return (skip, take) => getDealRepo().exportItems({ skip, take });
      case EntityType.service:
        return (skip, take) => getServiceRepo().exportItems({ skip, take });
      case EntityType.task:
        return (skip, take) => getTaskRepo().exportItems({ skip, take });
    }
  }

  private userLoader(): PageLoader {
    return (skip, take) => getUserRepo().getItems({ skip, take });
  }
}
