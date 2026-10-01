import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import { EntityType, Prisma } from "@/generated/prisma";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { StubRepo } from "./base-get-does-not-persist-stub-repo";

type Item = { id: string };

export class ProbeInteractor extends BaseGetInteractor<Item> {
  constructor(viewStateRepo: DataViewStateRepo, repo: StubRepo) {
    super(repo, viewStateRepo, "interactive", EntityType.contact, {
      sortDescriptor: { field: "createdAt", direction: Prisma.SortOrder.desc },
    });
  }
}
