import { useMemo, useSyncExternalStore } from "react";

import type { IntlStore } from "./intl.store";
import { useRootStore } from "./root-store.provider";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const emptyFormatter = () => "";

const EMPTY_DATE_FORMAT_MAP: IntlStore["dateFormatMap"] = {
  numericalLong: emptyFormatter,
  numericalShort: emptyFormatter,
  descriptiveShort: emptyFormatter,
  descriptiveLong: emptyFormatter,
  relative: emptyFormatter,
};

const ZONED_FORMATTERS = new Set<keyof IntlStore>([
  "formatNumericalLongDate",
  "formatNumericalShortDate",
  "formatDescriptiveShortDate",
  "formatDescriptiveLongDate",
  "formatNumericalLongDateTime",
  "formatNumericalShortDateTime",
  "formatDescriptiveShortDateTime",
  "formatDescriptiveLongDateTime",
  "formatTime",
  "formatRelativeTime",
]);

declare const hydrationSafeIntlStore: unique symbol;

export type HydrationSafeIntlStore = IntlStore & {
  readonly [hydrationSafeIntlStore]: true;
};

function beforeHydration(store: IntlStore): HydrationSafeIntlStore {
  return new Proxy(store, {
    get(target, property) {
      if (property === "rendersZonedValues") return false;
      if (property === "dateFormatMap" || property === "dateTimeFormatMap") return EMPTY_DATE_FORMAT_MAP;
      if (ZONED_FORMATTERS.has(property as keyof IntlStore)) return emptyFormatter;

      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as HydrationSafeIntlStore;
}

export function useHydratedIntlStore(): HydrationSafeIntlStore {
  const { intlStore } = useRootStore();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const serverView = useMemo(() => beforeHydration(intlStore), [intlStore]);

  return (hydrated ? intlStore : serverView) as HydrationSafeIntlStore;
}
