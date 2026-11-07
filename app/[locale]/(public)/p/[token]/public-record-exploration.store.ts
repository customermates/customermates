import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { RecordExplorationStore } from "@/app/[locale]/(protected)/w/[workspace]/records/[typeId]/components/record-exploration.store";

export class PublicRecordExplorationStore extends RecordExplorationStore {
  constructor(
    root: RootStore,
    presentation: RecordPresentationResult,
    private readonly load: (params?: GetQueryParams) => Promise<RecordPresentationResult>,
  ) {
    super(root, presentation, []);
  }

  override get isDisabled(): boolean {
    return false;
  }

  protected override loadPresentation(params?: GetQueryParams): Promise<RecordPresentationResult> {
    return this.load(params);
  }
}
