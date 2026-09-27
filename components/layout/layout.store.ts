import { action, makeObservable, observable } from "mobx";

type RuntimeAvatarKind = "contact" | "organization" | "messaging";

export type RuntimeIdentity = {
  scope: "entity" | "inbox";
  key: string;
  title: string;
  pictureUrl: string | null;
  avatarKind: RuntimeAvatarKind | null;
};

export class LayoutStore {
  runtimeIdentity: RuntimeIdentity | null = null;

  constructor() {
    makeObservable(this, {
      runtimeIdentity: observable,
      setRuntimeIdentity: action,
      clearRuntimeIdentity: action,
    });
  }

  setRuntimeIdentity = (runtimeIdentity: RuntimeIdentity) => {
    this.runtimeIdentity = runtimeIdentity;
  };

  clearRuntimeIdentity = (scope: RuntimeIdentity["scope"], key: string) => {
    if (this.runtimeIdentity?.scope === scope && this.runtimeIdentity.key === key) this.runtimeIdentity = null;
  };
}
