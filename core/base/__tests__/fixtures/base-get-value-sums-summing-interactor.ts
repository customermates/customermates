import { vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { StubRepo } from "./base-get-value-sums-stub-repo";

type Item = { id: string; totalValue: number };

export class SummingInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo, fields: readonly string[]) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
      undefined,
      undefined,
      undefined,
      fields,
    );
  }
}
