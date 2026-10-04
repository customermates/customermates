import type { GetResult } from "../../base-get.interactor";
import type { GetQueryParams } from "../../base-get.schema";
import { BaseDataViewStore } from "../../base-data-view.store";

export type Item = { id: string };

export class TestStore extends BaseDataViewStore<Item> {
  static echo: (params?: GetQueryParams) => GetResult<Item> = () => {
    throw new Error("TestStore.echo must be assigned by the test");
  };

  requestedParams: (GetQueryParams | undefined)[] = [];
  nextRefresh?: () => Promise<GetResult<Item>>;
  availableColumns = [{ uid: "name" }, { uid: "stage" }];

  get columnsDefinition() {
    return this.availableColumns;
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);
    return this.nextRefresh ? this.nextRefresh() : Promise.resolve(TestStore.echo(params));
  }
}
