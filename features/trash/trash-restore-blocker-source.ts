import type { TrashItem } from "./trash.repo";
import type { TrashRestoreBlocker } from "./trash.schema";

export abstract class TrashRestoreBlockerSource {
  abstract blockers(items: TrashItem[]): Promise<TrashRestoreBlocker[]>;
}
