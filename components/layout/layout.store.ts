import { action, makeObservable, observable } from "mobx";

type RuntimeAvatarKind = "contact" | "organization";

export class LayoutStore {
  isMenuOpen = false;
  runtimeTitle: string | null = null;
  runtimePictureUrl: string | null = null;
  runtimeAvatarKind: RuntimeAvatarKind | null = null;

  constructor() {
    makeObservable(this, {
      isMenuOpen: observable,
      runtimeTitle: observable,
      runtimePictureUrl: observable,
      runtimeAvatarKind: observable,
      setIsMenuOpen: action,
      setRuntimeTitle: action,
      setRuntimePictureUrl: action,
      setRuntimeAvatarKind: action,
    });
  }

  setIsMenuOpen = (isMenuOpen: boolean) => {
    this.isMenuOpen = isMenuOpen;
  };

  setRuntimeTitle = (runtimeTitle: string | null) => {
    this.runtimeTitle = runtimeTitle;
  };

  setRuntimePictureUrl = (runtimePictureUrl: string | null) => {
    this.runtimePictureUrl = runtimePictureUrl;
  };

  setRuntimeAvatarKind = (runtimeAvatarKind: RuntimeAvatarKind | null) => {
    this.runtimeAvatarKind = runtimeAvatarKind;
  };
}
