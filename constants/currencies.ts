import { Currency } from "@/generated/prisma";

export const CURRENCIES = [
  { key: Currency.aud },
  { key: Currency.brl },
  { key: Currency.cad },
  { key: Currency.chf },
  { key: Currency.cny },
  { key: Currency.eur },
  { key: Currency.gbp },
  { key: Currency.inr },
  { key: Currency.jpy },
  { key: Currency.usd },
] as const;
