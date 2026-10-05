import { vi } from "vitest";
import { BaseGetInteractor } from "../../base-get.interactor";
import type { FailClosedRepo } from "./resolve-grouping-fail-closed-repo";

type Item = { id: string };

export class UngroupableSurface extends BaseGetInteractor<Item> {
  constructor(repo: FailClosedRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      undefined,
    );
  }
}
