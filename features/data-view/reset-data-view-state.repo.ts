import type { ResetDataViewStateInput } from "./reset-data-view-state.schema";

export abstract class ResetDataViewStateRepo {
  abstract resetOwnedViewState(input: ResetDataViewStateInput): Promise<boolean>;
}
