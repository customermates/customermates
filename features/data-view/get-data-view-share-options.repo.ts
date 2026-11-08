import type { DataViewShareOptions } from "./data-view.schema";

export type ShareableRole = DataViewShareOptions["roles"][number];

export abstract class GetDataViewShareOptionsRepo {
  abstract listShareableRoles(): Promise<ShareableRole[]>;
}
