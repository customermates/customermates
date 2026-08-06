import { describe, expect, it } from "vitest";

import { Currency } from "@/generated/prisma";

import { CURRENCIES, getCurrencyLabel } from "../currencies";

const CURRENT_CIRCULATING_ISO_CURRENCIES = `
  aed afn all amd aoa ars aud awg azn bam bbd bdt bhd bif bmd bnd bob brl bsd btn bwp byn bzd cad cdf chf clp
  cny cop crc cup cve czk djf dkk dop dzd egp ern etb eur fjd fkp gbp gel ghs gip gmd gnf gtq gyd hkd hnl htg
  huf idr ils inr iqd irr isk jmd jod jpy kes kgs khr kmf kpw krw kwd kyd kzt lak lbp lkr lrd lsl lyd mad mdl
  mga mkd mmk mnt mop mru mur mvr mwk mxn myr mzn nad ngn nio nok npr nzd omr pab pen pgk php pkr pln pyg qar
  ron rsd rub rwf sar sbd scr sdg sek sgd shp sle sos srd ssp stn svc syp szl thb tjs tmt tnd top try ttd twd
  tzs uah ugx usd uyu uzs ved ves vnd vuv wst xaf xcd xcg xof xpf yer zar zmw zwg
`
  .trim()
  .split(/\s+/);

describe("currency catalog", () => {
  it("matches the vetted 155-code current circulating ISO catalog and the generated Prisma enum", () => {
    const catalog = CURRENCIES.map(({ key }) => String(key));

    expect(catalog).toEqual(CURRENT_CIRCULATING_ISO_CURRENCIES);
    expect([...Object.values(Currency)].sort()).toEqual(CURRENT_CIRCULATING_ISO_CURRENCIES);
    expect(new Set(catalog).size).toBe(155);
    expect(catalog).toContain(Currency.idr);
  });

  it.each(["bov", "usn", "xau", "xxx"])("excludes the non-circulating special code %s", (code) => {
    expect(CURRENCIES.map(({ key }) => String(key))).not.toContain(code);
  });

  it("localizes IDR while keeping its searchable uppercase code visible", () => {
    const english = getCurrencyLabel(Currency.idr, "en");
    const german = getCurrencyLabel(Currency.idr, "de");

    expect(english).not.toBe("IDR");
    expect(english).toMatch(/\(IDR\)$/);
    expect(german).not.toBe("IDR");
    expect(german).toMatch(/\(IDR\)$/);
  });

  it("falls back to the uppercase code when the locale is unsupported", () => {
    expect(getCurrencyLabel(Currency.idr, "not_a_locale")).toBe("IDR");
  });
});
