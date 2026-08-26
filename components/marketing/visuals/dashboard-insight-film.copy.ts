import type { ContentLocale } from "@/i18n/locale-registry";

export const DASHBOARD_INSIGHT_FILM_COPY = {
  de: {
    ariaLabel: "Ein Mensch wählt vier gewonnene Deals mit einem Gesamtwert von 545.500 Euro aus.",
    deals: "Deals",
    status: "Status",
    total: "gesamt",
    totalValue: "Gesamtwert",
    widget: "Deal-Übersicht",
  },
  en: {
    ariaLabel: "A human selects four won deals with a total value of 545,500 euros.",
    deals: "deals",
    status: "Status",
    total: "total",
    totalValue: "total value",
    widget: "Deal Overview",
  },
} as const satisfies Record<
  ContentLocale,
  {
    ariaLabel: string;
    deals: string;
    status: string;
    total: string;
    totalValue: string;
    widget: string;
  }
>;
