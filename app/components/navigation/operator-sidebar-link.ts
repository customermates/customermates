import { isOperatorPathname } from "./navigation-shell";

type OperatorSidebarLink = {
  ariaCurrent?: "page";
  href: "/operator/users";
  isActive: boolean;
  prefetch: false;
};

export function resolveOperatorSidebarLink(
  operatorConsoleVisible: boolean,
  pathname: string | null,
): OperatorSidebarLink | null {
  if (!operatorConsoleVisible) return null;

  return {
    ...(pathname === "/operator/users" ? { ariaCurrent: "page" as const } : {}),
    href: "/operator/users",
    isActive: isOperatorPathname(pathname),
    prefetch: false,
  };
}
