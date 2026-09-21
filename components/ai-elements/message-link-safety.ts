import type { LinkSafetyConfig } from "streamdown";
import { parseWikiPageHref } from "@/features/wiki/wiki-links";

export const messageLinkSafety: LinkSafetyConfig = {
  enabled: true,
  onLinkCheck: (url) => parseWikiPageHref(url) !== null,
};
