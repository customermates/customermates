export const CONFIGURATION_TRASH_HREF = "/trash?kinds=list,field,relationship,channels";

export function configurationTrashHref(focus?: string): string {
  return focus ? `${CONFIGURATION_TRASH_HREF}&focus=${encodeURIComponent(focus)}` : CONFIGURATION_TRASH_HREF;
}
