export abstract class GetDataViewShareOptionsRepo {
  abstract listShareableRoles(): Promise<{ id: string; name: string }[]>;
}
