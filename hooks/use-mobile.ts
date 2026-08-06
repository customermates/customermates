import { useIsWiderThan } from "./use-media-query";

export function useIsMobile() {
  return !useIsWiderThan("md");
}
