export abstract class DeleteDataViewSelectionRepo {
  abstract clearActiveViewKeyIfMatches(data: { p13nId: string; expectedActiveViewKey: string }): Promise<boolean>;
}
