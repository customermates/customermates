import { vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { SpyRepo } from "./grouped-query-budget-spy-repo";

type Item = { id: string };

export class BudgetInteractor extends BaseGetInteractor<Item> {
  constructor(repo: SpyRepo, sumFields: readonly string[] = ["totalValue"]) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
      undefined,
      undefined,
      undefined,
      sumFields,
    );
  }
}
