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
  isMenuOpen = false;
  runtimeIdentity: RuntimeIdentity | null = null;

  constructor() {
    makeObservable(this, {
      isMenuOpen: observable,
      runtimeIdentity: observable,
      setIsMenuOpen: action,
      setRuntimeIdentity: action,
      clearRuntimeIdentity: action,
    });
  }

  setIsMenuOpen = (isMenuOpen: boolean) => {
    this.isMenuOpen = isMenuOpen;
  };

  setRuntimeIdentity = (runtimeIdentity: RuntimeIdentity) => {
    this.runtimeIdentity = runtimeIdentity;
  };

  clearRuntimeIdentity = (scope: RuntimeIdentity["scope"], key: string) => {
    if (this.runtimeIdentity?.scope === scope && this.runtimeIdentity.key === key) this.runtimeIdentity = null;
  };
}
