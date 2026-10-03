import type { ActivityScope } from "./activity-scope.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import type { ActivityEntryDto, ActivityKind } from "./activities.schema";

export abstract class GetActivitiesRepo extends BaseGetRepo<ActivityEntryDto> {
  abstract canReadMessagingSources(): boolean;
  abstract getAvailableSources(): ActivityKind[];
  abstract isScopeTruncated(): Promise<boolean>;
  abstract setMessagingSourcesEnabled(enabled: boolean): void;
  abstract setScope(scope?: ActivityScope): void;
}
