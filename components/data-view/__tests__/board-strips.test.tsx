import { describe, expect, it, vi } from "vitest";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

type Item = { id: string };

class TestStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [{ uid: "name" }];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.reject(new Error("The strip state never refreshes"));
  }
}

function store() {
  return new TestStore({
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
}

describe("board strips", () => {
  it("shows empty columns as strips until the person expands them", () => {
    const board = store();
    expect(board.isBoardStrip("value:open", 0)).toBe(true);

    board.toggleBoardStrip("value:open", 0);
    expect(board.isBoardStrip("value:open", 0)).toBe(false);
    expect(board.collapsedGroupKeys.has("value:open")).toBe(false);

    board.toggleBoardStrip("value:open", 0);
    expect(board.isBoardStrip("value:open", 0)).toBe(true);
  });

  it("collapses a column with cards into a strip and expands it again", () => {
    const board = store();
    expect(board.isBoardStrip("value:won", 3)).toBe(false);

    board.toggleBoardStrip("value:won", 3);
    expect(board.isBoardStrip("value:won", 3)).toBe(true);
    expect(board.collapsedGroupKeys.has("value:won")).toBe(true);
  });

  it("hides and shows columns and empty columns in the view's grouping", () => {
    const board = store();
    board.grouping = { field: "stage" };

    board.hideGroup("value:won");
    board.hideGroup("value:won");
    expect(board.grouping).toEqual({ field: "stage", hidden: ["value:won"] });
    expect(board.isGroupHidden("value:won")).toBe(true);

    board.setHideEmptyGroups(true);
    expect(board.grouping).toEqual({ field: "stage", hidden: ["value:won"], hideEmpty: true });

    board.setHideEmptyGroups(false);
    expect(board.grouping).toEqual({ field: "stage", hidden: ["value:won"] });
  });
});
