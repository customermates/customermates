import type { LinkSafetyConfig } from "streamdown";

export const messageLinkSafety: LinkSafetyConfig = {
  enabled: true,
  onLinkCheck: (url) => /^\/wiki\?page=[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(url),
};
