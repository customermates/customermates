import { vi } from "vitest";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { OperatorLikeRepo } from "./base-get-groupable-without-entity-type-operator-like-repo";

type Item = { id: string; status: string };

export class OperatorLikeInteractor extends BaseGetInteractor<Item> {
  constructor(repo: OperatorLikeRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      undefined,
      undefined,
      undefined,
      undefined,
      ["amount"],
    );
  }
}
