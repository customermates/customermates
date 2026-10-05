import { vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { StubRepo } from "./base-get-grouped-order-stub-repo";

type Item = { id: string };

export class GroupingInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
    );
  }
}
