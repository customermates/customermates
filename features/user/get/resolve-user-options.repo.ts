import type { UserOption } from "./resolve-user-options.interactor";

export abstract class ResolveUserOptionsRepo {
  abstract resolveUserOptions(ids: string[]): Promise<UserOption[]>;
}
