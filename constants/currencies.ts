export const CURRENCIES: ReadonlyArray<{ key: string }> = `
  aed afn all amd aoa ars aud awg azn bam bbd bdt bhd bif bmd bnd bob brl bsd btn bwp byn bzd cad cdf chf clp
  cny cop crc cup cve czk djf dkk dop dzd egp ern etb eur fjd fkp gbp gel ghs gip gmd gnf gtq gyd hkd hnl htg
  huf idr ils inr iqd irr isk jmd jod jpy kes kgs khr kmf kpw krw kwd kyd kzt lak lbp lkr lrd lsl lyd mad mdl
  mga mkd mmk mnt mop mru mur mvr mwk mxn myr mzn nad ngn nio nok npr nzd omr pab pen pgk php pkr pln pyg qar
  ron rsd rub rwf sar sbd scr sdg sek sgd shp sle sos srd ssp stn svc syp szl thb tjs tmt tnd top try ttd twd
  tzs uah ugx usd uyu uzs ved ves vnd vuv wst xaf xcd xcg xof xpf yer zar zmw zwg
`
  .trim()
  .split(/\s+/)
  .map((key) => ({ key }));

export function getCurrencyLabel(currency: string, locale: string): string {
  const code = currency.toUpperCase();

  try {
    const localizedName = new Intl.DisplayNames([locale], {
      type: "currency",
    }).of(code);
    return localizedName && localizedName !== code ? `${localizedName} (${code})` : code;
  } catch {
    return code;
  }
}
