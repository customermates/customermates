import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RootStore } from "@/core/stores/root.store";
import { RecordsStore } from "./records.store";

export class RecordExplorationStore extends RecordsStore {
  constructor(root: RootStore, presentation: RecordPresentationResult) {
    super(root, presentation);
    this.setItems(presentation.result);
  }
  protected override canPersistViewState() {
    return false;
  }
  override setItems(result: GetResult<RecordRow>) {
    super.setItems({ ...result, p13nId: undefined, views: [], activeViewKey: ALL_VIEW_KEY, viewPersistable: false });
  }
  override get supportsSelection() {
    return false;
  }
  override get supportsBoard() {
    return false;
  }
  override get canCalendar() {
    return false;
  }
  override get supportsCalendar() {
    return false;
  }
}
