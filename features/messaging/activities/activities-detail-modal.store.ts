import type { RootStore } from "@/core/stores/root.store";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { BaseModalStore } from "@/core/base/base-modal.store";

type TimelineDetailForm = {
  entry: ActivityEntryDto | null;
};

export class TimelineDetailModalStore extends BaseModalStore<TimelineDetailForm> {
  constructor(rootStore: RootStore) {
    super(rootStore, { entry: null });
  }
}
