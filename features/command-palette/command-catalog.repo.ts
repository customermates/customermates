export type RecordViewName = { typeId: string; id: string; name: string };

export abstract class CommandCatalogRepo {
  abstract listRecordViewNames(): Promise<RecordViewName[]>;
}
