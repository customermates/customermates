import { action, makeObservable, observable } from "mobx";
import Cookies from "js-cookie";

const SIDEBAR_STATE_COOKIE = "sidebar-close";

export class LayoutStore {
  isMenuOpen = false;
  isNavbarVisible = true;
  isSidebarOpen = true;

  constructor(initialSidebarOpen?: boolean, initialNavbarVisible?: boolean) {
    const isSmallDevice = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

    if (initialSidebarOpen !== undefined) this.isSidebarOpen = initialSidebarOpen;
    else if (isSmallDevice) this.isSidebarOpen = false;

    if (initialNavbarVisible !== undefined) this.isNavbarVisible = initialNavbarVisible;

    makeObservable(this, {
      isMenuOpen: observable,
      isNavbarVisible: observable,
      isSidebarOpen: observable,
      setIsMenuOpen: action,
      setIsNavbarVisible: action,
      setIsSidebarOpen: action,
    });
  }

  setIsMenuOpen = (isMenuOpen: boolean) => {
    this.isMenuOpen = isMenuOpen;
  };

  setIsNavbarVisible = (isNavbarVisible: boolean) => {
    this.isNavbarVisible = isNavbarVisible;
  };

  setIsSidebarOpen = (isSidebarOpen: boolean) => {
    this.isSidebarOpen = isSidebarOpen;
    Cookies.set(SIDEBAR_STATE_COOKIE, String(!isSidebarOpen), {
      expires: 365,
      sameSite: "lax",
    });
  };
}
