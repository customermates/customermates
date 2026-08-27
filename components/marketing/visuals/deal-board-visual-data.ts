import type { ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_DEAL_BOARD_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  type VisualDealBoardFixtureId,
  type VisualPersonFixtureId,
  type VisualRecordFixtureId,
  type VisualStatusFixtureId,
} from "./native-fixtures";

const FORMATTING_TAGS: Record<ContentLocale, string> = {
  de: "de-DE",
  en: "en-US",
};

const STATUS_LABELS: Record<ContentLocale, Record<VisualStatusFixtureId, string>> = {
  de: {
    "deal-abandoned": "Aufgegeben",
    "deal-lost": "Verloren",
    "deal-open": "Offen",
    "deal-won": "Gewonnen",
  },
  en: {
    "deal-abandoned": "Abandoned",
    "deal-lost": "Lost",
    "deal-open": "Open",
    "deal-won": "Won",
  },
};

export type VisualDealBoardDeal = {
  assignee: VisualPersonFixtureId;
  formattedTotalValue: string;
  formattedWeightedValue: string;
  id: VisualRecordFixtureId;
  name: string;
  status: VisualStatusFixtureId;
  totalValue: number;
  weightedValue: number;
};

export type VisualDealBoardColumn = {
  count: number;
  deals: VisualDealBoardDeal[];
  formattedTotalValue: string;
  formattedWeightedValue: string;
  id: VisualStatusFixtureId;
  label: string;
  totalValue: number;
  variant: (typeof VISUAL_STATUS_FIXTURES)[VisualStatusFixtureId]["variant"];
  weight: number;
  weightedValue: number;
};

export function formatVisualDealBoardCurrency(amount: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(FORMATTING_TAGS[locale], {
    currency: "EUR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(amount);
}

export function getVisualDealBoardColumns(
  boardId: VisualDealBoardFixtureId,
  locale: ContentLocale,
): VisualDealBoardColumn[] {
  const board = VISUAL_DEAL_BOARD_FIXTURES[boardId];
  const deals = board.records.map((id) => ({ ...VISUAL_RECORD_FIXTURES[id], id }));

  return board.statuses.map((status) => {
    const fixture = VISUAL_STATUS_FIXTURES[status];
    const columnDeals = deals
      .filter((deal) => deal.status === status)
      .sort((left, right) => right.name.localeCompare(left.name, FORMATTING_TAGS[locale]))
      .map((deal) => ({
        assignee: deal.assignee,
        formattedTotalValue: formatVisualDealBoardCurrency(deal.totalValue, locale),
        formattedWeightedValue: formatVisualDealBoardCurrency(deal.weightedValue, locale),
        id: deal.id,
        name: deal.name,
        status: deal.status,
        totalValue: deal.totalValue,
        weightedValue: deal.weightedValue,
      }));
    const totalValue = columnDeals.reduce((sum, deal) => sum + deal.totalValue, 0);
    const weightedValue = columnDeals.reduce((sum, deal) => sum + deal.weightedValue, 0);

    return {
      count: columnDeals.length,
      deals: columnDeals,
      formattedTotalValue: formatVisualDealBoardCurrency(totalValue, locale),
      formattedWeightedValue: formatVisualDealBoardCurrency(weightedValue, locale),
      id: status,
      label: STATUS_LABELS[locale][status],
      totalValue,
      variant: fixture.variant,
      weight: fixture.weight,
      weightedValue,
    };
  });
}
