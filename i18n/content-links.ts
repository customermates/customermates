import { isContentPathname, isMarketingPathname } from "./routing";

const INTERNAL_URL_BASE = "https://internal.invalid";

function staysInContentTree(href: string): boolean {
  const target = new URL(href, INTERNAL_URL_BASE);

  return target.origin !== INTERNAL_URL_BASE || isContentPathname(target.pathname);
}

export function leavesContentTree(href: string, pathname: string): boolean {
  return isMarketingPathname(pathname) && !staysInContentTree(href);
}

export function contentLinkPrefetch(href: string): false | undefined {
  return staysInContentTree(href) ? undefined : false;
}
