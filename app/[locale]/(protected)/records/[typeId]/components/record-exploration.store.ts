import equal from "fast-deep-equal/es6";
import { runInAction, toJS } from "mobx";

import { saveDataViewStateAction } from "@/app/actions";
import { ALL_VIEW_KEY, recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RootStore } from "@/core/stores/root.store";
import { RecordsStore } from "./records.store";

export type RecordExplorationOptions = { persistAppearance?: boolean };

const APPEARANCE_WRITE_DELAY_MS = 500;

export class RecordExplorationStore extends RecordsStore {
  private readonly scope: Filter[];
  private readonly initialLayout: string;
  private readonly persistAppearance: boolean;
  private appearanceTimer: ReturnType<typeof setTimeout> | undefined;
  private appearanceWrite: Promise<void> = Promise.resolve();

  constructor(
    root: RootStore,
    presentation: RecordPresentationResult,
    scope: Filter[] = [],
    options: RecordExplorationOptions = {},
  ) {
    super(root, presentation);
    this.scope = scope;
    this.persistAppearance = options.persistAppearance ?? false;
    this.setItems(presentation.result);
    this.initialLayout = this.layoutKey;
  }
  get scopeFilters() {
    return this.scope;
  }
  get hasLayoutChanges() {
    return this.layoutKey !== this.initialLayout;
  }
  private get layoutKey() {
    return JSON.stringify([this.columnOrder, this.hiddenColumns, this.sortDescriptor, this.grouping]);
  }
  protected override canPersistViewState() {
    return false;
  }
  protected override onAppearanceChange() {
    if (!this.persistAppearance) return;
    clearTimeout(this.appearanceTimer);
    this.appearanceTimer = setTimeout(() => {
      this.appearanceTimer = undefined;
      this.appearanceWrite = this.appearanceWrite.then(this.writeAppearance);
    }, APPEARANCE_WRITE_DELAY_MS);
  }
  settleAppearance = async (): Promise<void> => {
    if (this.appearanceTimer !== undefined) {
      clearTimeout(this.appearanceTimer);
      this.appearanceTimer = undefined;
      this.appearanceWrite = this.appearanceWrite.then(this.writeAppearance);
    }
    await this.appearanceWrite;
  };
  private writeAppearance = async (): Promise<void> => {
    const state = {
      ...toJS(this.allViewState),
      sortDescriptor: toJS(this.sortDescriptor) ?? null,
      grouping: toJS(this.grouping) ?? null,
      columnOrder: toJS(this.columnOrder),
      hiddenColumns: toJS(this.hiddenColumns),
      columnWidths: toJS(this.columnWidths),
    };
    try {
      const result = await saveDataViewStateAction({
        surfaceKey: recordSurfaceKey(this.presentation.typeId),
        viewKey: ALL_VIEW_KEY,
        state,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      runInAction(() => (this.allViewState = state));
    } catch (error) {
      reportApplicationError(error);
    }
  };
  protected override refreshAction(params?: GetQueryParams) {
    return super.refreshAction({ ...params, filters: [...(this.scope ?? []), ...(params?.filters ?? [])] });
  }
  override setItems(result: GetResult<RecordRow>) {
    super.setItems({
      ...result,
      filters: result.filters?.filter((filter) => !(this.scope ?? []).some((scoped) => equal(scoped, filter))),
      p13nId: undefined,
      views: [],
      activeViewKey: ALL_VIEW_KEY,
      viewPersistable: false,
    });
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
