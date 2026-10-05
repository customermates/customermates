import { vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { FailClosedRepo } from "./resolve-grouping-fail-closed-repo";

type Item = { id: string };

export class GroupedSurface extends BaseGetInteractor<Item> {
  constructor(repo: FailClosedRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
    );
  }
}
