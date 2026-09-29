/**
 * Blind multilingual Wiki retrieval benchmark.
 *
 * The corpus is the internal Wiki of a fictional company, Hallberg Industrietechnik GmbH, a mid-sized industrial-parts
 * distributor in Kassel that sells bearings, seals, pneumatics, drive components and standard parts to resellers and
 * industrial customers across the EU. It has 25 German and 15 English pages: one Operating Guide, nine procedures and
 * thirty knowledge pages, with deliberate near-duplicates (returns versus warranty versus invoice disputes, EU versus
 * non-EU shipping, reseller versus industrial versus foreign-distributor discounts, German versus international
 * onboarding).
 *
 * Each query carries its category, its language and its gold targets. A target names a page slug and the exact text of
 * a `##` section heading on that page. The first target is the primary answer; any further targets are sections that
 * answer the query equally well and count as correct. A `no-match` query has no targets: nothing in the Wiki answers it,
 * and the correct result is an empty or explicitly rejected result list.
 *
 * The queries and labels were written without reading or running the retrieval implementation or any earlier retrieval
 * result, so the set can be used as a held-out check. Do not tune ranking against individual items here; fix a label
 * only when the corpus text shows it is wrong.
 */
import type { WikiPageKind } from "@/features/wiki/wiki.schema";

export type WikiBenchmarkPageLanguage = "de" | "en";
export type WikiBenchmarkQueryLanguage = "de" | "en" | "es" | "fr" | "it";
export type WikiBenchmarkCategory = "lexical" | "paraphrase" | "cross-language" | "typo" | "multi-hop" | "no-match";

export type WikiBenchmarkPage = {
  slug: string;
  language: WikiBenchmarkPageLanguage;
  kind: WikiPageKind;
  title: string;
  whenToUse: string | null;
  markdown: string;
};

export type WikiBenchmarkTarget = { slug: string; section: string };

export type WikiBenchmarkQuery = {
  id: string;
  language: WikiBenchmarkQueryLanguage;
  category: WikiBenchmarkCategory;
  query: string;
  targets: readonly WikiBenchmarkTarget[];
};

export type WikiBenchmarkSection = { heading: string; text: string };

export type WikiRetrievalBenchmark = {
  pages: readonly WikiBenchmarkPage[];
  queries: readonly WikiBenchmarkQuery[];
};

const PAGES: readonly WikiBenchmarkPage[] = [
  {
    slug: "onboarding-neue-mitarbeitende",
    language: "de",
    kind: "knowledge",
    title: "Onboarding für neue Mitarbeitende",
    whenToUse: null,
    markdown: `Diese Seite beschreibt, was neue Kolleginnen und Kollegen im Vertrieb und Kundenservice in den ersten Wochen bei Hallberg erwartet. Internationale Außendienstler im Homeoffice lesen stattdessen die Seite Onboarding for international sales reps.

## Die erste Woche

Am ersten Tag holt dich deine Teamleitung um 8:30 Uhr am Empfang in Kassel ab. Vormittags gibt es die Sicherheitsunterweisung für Lager und Büro, nachmittags richtet die IT deinen Laptop ein. Ab Tag zwei begleitest du erfahrene Kolleginnen und Kollegen im Innendienst und hörst bei Kundentelefonaten mit. Am Freitag der ersten Woche findet ein Feedbackgespräch mit der Teamleitung statt.

## Patenschaft

Jede neue Person bekommt für die ersten drei Monate eine Patin oder einen Paten aus einem anderen Team. Die Patenschaft ist für alle Fragen gedacht, die man der Führungskraft nicht stellen möchte: Wo liegt das Verbrauchsmaterial? Wer kennt sich mit dem ERP aus? Ein gemeinsames Mittagessen pro Woche geht auf Firmenkosten.

## Arbeitsplatz und Ausstattung

Laptop, Headset und Diensthandy werden vor dem ersten Arbeitstag bestellt. Das Diensthandy ist ein Android-Gerät; private Apps sind erlaubt, solange die Geräteverwaltung aktiv bleibt. Für das Homeoffice gibt es auf Antrag einen zweiten Monitor. Zugänge zu den einzelnen Programmen beantragt die Teamleitung, siehe die Seite Tool access and accounts.

## Pflichtschulungen

Innerhalb der ersten 30 Tage müssen folgende Online-Schulungen abgeschlossen sein: Datenschutz-Grundlagen, Informationssicherheit, Exportkontrolle und Antikorruption. Die Kurse liegen in der Lernplattform, jeder dauert etwa 45 Minuten. Ohne abgeschlossene Exportkontroll-Schulung dürfen keine Angebote in Drittländer verschickt werden.

## Produktschulung

In den Wochen zwei bis vier durchläuft jede Person im Vertrieb die Produktschulung: je ein halber Tag zu Wälzlagern, Dichtungen, Pneumatik und Antriebstechnik, gehalten vom Produktmanagement. Zum Abschluss gibt es einen kurzen Test; wer unter 70 Prozent bleibt, wiederholt das Modul.
`,
  },
  {
    slug: "rabatte-fachhandel",
    language: "de",
    kind: "knowledge",
    title: "Rabattregeln Fachhandel und Wiederverkäufer",
    whenToUse: null,
    markdown: `Gilt für deutsche Händler, die unsere Artikel weiterverkaufen (Kundengruppe H). Für Industrie-Direktkunden gilt die Seite Rabattregeln Industrie-Direktkunden, für Händler im Ausland Pricing for EU distributors.

## Grundrabatt nach Partnerstufe

Händler erhalten auf den Listenpreis einen Grundrabatt abhängig von ihrer Partnerstufe: Bronze 18 %, Silber 24 %, Gold 30 %. Die Stufe steht im CRM am Firmendatensatz im Feld Partnerstufe und wird jährlich im Januar anhand des Vorjahresumsatzes neu festgelegt.

## Staffelrabatte je Auftrag

Zusätzlich zum Grundrabatt gibt es einen Mengenrabatt pro Auftrag: ab 2.500 € Netto-Warenwert 2 %, ab 10.000 € 4 %. Mehrere Lieferadressen in einem Auftrag zählen zusammen, Teillieferungen ebenfalls. Sammelbestellungen über mehrere Tage werden nicht zusammengerechnet.

## Jahresbonus

Händler mit einem Jahresumsatz über 150.000 € erhalten im Folgejahr eine Rückvergütung von 1,5 % als Gutschrift, ab 400.000 € sind es 3 %. Die Auszahlung erfolgt im März, sofern keine offenen Posten älter als 60 Tage bestehen.

## Freigabegrenzen im Innendienst

Innendienst-Mitarbeitende dürfen Händlern bis zu 3 Prozentpunkte über den Grundrabatt hinaus eigenständig gewähren. Bis 6 Prozentpunkte gibt die Vertriebsleitung frei, alles darüber nur die Geschäftsführung. Die Begründung gehört in die Notiz am Angebot.

## Aktionspreise

Aktionspreise aus dem Händlernewsletter sind nicht mit Staffelrabatten kombinierbar. Es gilt immer der für den Kunden günstigere Preis, nie beide zusammen. Aktionen laufen in der Regel vier Wochen und stehen im Händlerportal.
`,
  },
  {
    slug: "rabatte-industriekunden",
    language: "de",
    kind: "knowledge",
    title: "Rabattregeln Industrie-Direktkunden",
    whenToUse: null,
    markdown: `Gilt für Endkunden aus Industrie und Instandhaltung (Kundengruppe I), also Maschinenbauer, Werke und Wartungsbetriebe, die unsere Teile selbst verbauen oder verbrauchen.

## Rahmenverträge

Kunden mit Rahmenvertrag erhalten feste Nettopreise für die im Vertrag gelisteten Artikel, meist für zwölf Monate. Artikel außerhalb der Liste werden zum Listenpreis abzüglich des vereinbarten Sortimentsrabatts berechnet. Rahmenverträge verlängern sich nicht automatisch; drei Monate vor Ablauf erinnert das CRM den zuständigen Außendienst.

## Projektpreise

Für einmalige Großprojekte, etwa eine neue Fertigungslinie, kann ein Projektpreis vergeben werden. Voraussetzung ist ein Auftragswert von mindestens 25.000 € und ein Ansprechpartner aus dem Einkauf des Kunden. Projektpreise gelten nur für die Projektnummer und dürfen nicht für Nachbestellungen verwendet werden.

## Freigabegrenzen für den Außendienst

Der Außendienst darf Industriekunden bis 10 % Rabatt auf den Listenpreis ohne Rückfrage geben. Zwischen 10 und 20 % ist die Freigabe der Vertriebsleitung nötig, über 20 % die der Geschäftsführung. Anders als im Handel wird immer vom Listenpreis aus gerechnet, nicht von einem Grundrabatt.

## Mindermengenzuschlag

Aufträge unter 150 € Warenwert erhalten einen Mindermengenzuschlag von 15 €. Bei Kunden mit Rahmenvertrag entfällt der Zuschlag. Eilaufträge wegen Maschinenstillstand sind ebenfalls ausgenommen, wenn das im Auftrag vermerkt ist.
`,
  },
  {
    slug: "rueckgaben-gutschriften",
    language: "de",
    kind: "knowledge",
    title: "Rückgaben und Gutschriften",
    whenToUse: null,
    markdown: `Regeln für die Rücknahme von einwandfreier Ware, die der Kunde nicht mehr braucht, etwa nach einer Fehlbestellung oder bei zu großer Menge. Defekte Ware ist eine Reklamation, siehe Reklamation bearbeiten. Für Kunden außerhalb Deutschlands ergänzt die Seite Returns from customers outside Germany diese Regeln.

## Rücksendenummer anfordern

Der Kunde darf nichts ohne Rücksendenummer schicken. Der Innendienst legt die RMA im ERP an und schickt dem Kunden das Rücksendeetikett per E-Mail. Pakete ohne Nummer werden am Wareneingang abgelehnt und gehen unfrei zurück.

## Rückgabefrist

Einwandfreie Lagerware nehmen wir innerhalb von 30 Tagen nach Lieferdatum zurück. Nach Ablauf der Frist nur mit Freigabe der Vertriebsleitung und nur bei Kunden mit Rahmenvertrag.

## Zustand der Ware

Die Ware muss originalverpackt, ungebraucht und wieder verkaufsfähig sein. Angebrochene Packungen von Normteilen nehmen wir nicht zurück. Lager mit beschädigter Korrosionsschutzfolie gelten als gebraucht.

## Wiedereinlagerungsgebühr

Für jede Rücknahme berechnen wir pauschal 15 % des Warenwerts, mindestens 20 €, für Prüfung und Wiedereinlagerung. Hat Hallberg falsch geliefert, entfällt die Gebühr, und wir holen die Ware auf unsere Kosten ab.

## Ausgeschlossene Artikel

Nicht rücknahmefähig sind Sonderanfertigungen, auf Maß geschnittene Riemen und Schläuche, Bestellartikel ohne Lagerhaltung sowie Chemie wie Fette und Kleber mit Mindesthaltbarkeit.

## Gutschrift und Erstattung

Nach Wareneingang prüft das Lager die Rücksendung innerhalb von fünf Arbeitstagen. Die Gutschrift wird mit der nächsten Rechnung verrechnet. Eine Auszahlung aufs Konto erfolgt nur, wenn der Kunde es ausdrücklich verlangt oder keine weiteren Bestellungen erwartet werden.
`,
  },
  {
    slug: "gewaehrleistung-garantie",
    language: "de",
    kind: "knowledge",
    title: "Gewährleistung und Herstellergarantie",
    whenToUse: null,
    markdown: `Klärt, wie lange und unter welchen Bedingungen wir für Mängel einstehen. Den operativen Ablauf bei einem gemeldeten Mangel beschreibt Reklamation bearbeiten.

## Gesetzliche Gewährleistung

Gegenüber Geschäftskunden gilt bei uns eine Gewährleistung von zwölf Monaten ab Lieferung, wie in unseren AGB vereinbart. Privatkunden beliefern wir nicht. Die Frist beginnt mit dem Lieferdatum, nicht mit dem Einbau beim Kunden.

## Herstellergarantie

Einige Hersteller geben freiwillig längere Garantien, zum Beispiel 24 Monate auf Pneumatikzylinder der Hausmarke HALCO und 36 Monate auf Linearführungen eines Partnerherstellers. Diese Garantie läuft über den Hersteller; wir leiten den Fall weiter, entscheiden aber nicht selbst.

## Ausschlüsse

Keine Haftung bei Verschleiß von Dichtungen und Riemen, falscher Montage, fehlender Schmierung, Überlast oder Betrieb außerhalb der Datenblattwerte. Auch Schäden durch ungeeignete Lagerung beim Kunden, etwa Feuchtigkeit, sind ausgeschlossen.

## Nachweise

Für jede Prüfung brauchen wir die Rechnungs- oder Lieferscheinnummer, die Chargennummer vom Etikett, Fotos des Schadens und eine kurze Beschreibung der Einbausituation. Ohne Chargennummer kann die Qualitätssicherung den Fall nicht dem Hersteller zuordnen.

## Folgekosten

Ein- und Ausbaukosten, Maschinenstillstand oder entgangenen Gewinn erstatten wir grundsätzlich nicht. Ausnahmen regeln einzelne Rahmenverträge mit Key Accounts; im Zweifel beim Key-Account-Manager nachfragen.
`,
  },
  {
    slug: "reklamation-bearbeiten",
    language: "de",
    kind: "procedure",
    title: "Reklamation bearbeiten",
    whenToUse:
      "Wenn ein Kunde meldet, dass ein geliefertes Teil defekt, falsch gefertigt oder vorzeitig ausgefallen ist.",
    markdown: `Ablauf für Mängelmeldungen. Ob überhaupt ein Anspruch besteht, regelt die Seite Gewährleistung und Herstellergarantie.

## Schritt 1: Fall im CRM anlegen

Lege am Firmendatensatz eine Aufgabe vom Typ Reklamation an und verknüpfe den Auftrag. Titel: Artikelnummer und Kurzbeschreibung. Setze die Fälligkeit auf zwei Arbeitstage.

## Schritt 2: Angaben vom Kunden einholen

Fordere Fotos, Chargennummer, Lieferscheinnummer und die bisherige Einsatzdauer an. Nutze die Textvorlage Reklamation-Angaben. Fehlen Angaben nach fünf Tagen, einmal nachfassen und dann schließen.

## Schritt 3: Prüfung durch die Qualitätssicherung

Leite den vollständigen Fall an das QS-Postfach weiter. Die QS entscheidet innerhalb von fünf Arbeitstagen, ob ein Mangel vorliegt, und fordert bei Bedarf das Teil zur Untersuchung an. Dafür erstellt der Innendienst eine kostenlose Rücksendenummer.

## Schritt 4: Ersatz oder Gutschrift

Erkennt die QS den Mangel an, erhält der Kunde wahlweise kostenlosen Ersatz per Express oder eine Gutschrift. Bei Ablehnung schickt der Innendienst die Begründung der QS schriftlich und bietet einen Kulanzrabatt von 10 % auf das Ersatzteil an, sofern der Kunde mehr als 20.000 € Umsatz pro Jahr macht.

## Schritt 5: Abschluss

Dokumentiere das Ergebnis in der Aufgabe und schließe sie. Tritt derselbe Mangel beim selben Artikel wiederholt auf, ergänze den Vermerk Serienfehler, damit das Produktmanagement informiert wird.
`,
  },
  {
    slug: "rechnungsdifferenzen-klaeren",
    language: "de",
    kind: "procedure",
    title: "Rechnungsdifferenzen klären",
    whenToUse:
      "Wenn ein Kunde einen Rechnungsbetrag bestreitet, etwa wegen falscher Preise, doppelter Berechnung oder fehlender Rabatte.",
    markdown: `Ablauf für Beanstandungen einer Rechnung. Ziel ist eine Klärung innerhalb von 14 Tagen. Der Innendienst bleibt während der gesamten Klärung Ansprechpartner des Kunden.

## Schritt 1: Einordnen

Prüfe zuerst, ob es wirklich um die Rechnung geht. Beschwert sich der Kunde über defekte Ware, ist es eine Reklamation; will er Ware zurückgeben, gilt Rückgaben und Gutschriften. Typische Rechnungsdifferenzen sind ein abweichender Preis gegenüber dem Angebot, eine doppelt berechnete Position, fehlender Skonto oder falsche Frachtkosten.

## Schritt 2: Mahnsperre setzen

Setze im ERP sofort eine Mahnsperre auf die betroffene Rechnung, damit der Kunde während der Klärung keine Mahnung bekommt. Die Sperre gilt höchstens 30 Tage und muss im CRM vermerkt werden.

## Schritt 3: Mit der Buchhaltung klären

Vergleiche Auftragsbestätigung, Lieferschein und Rechnung. Ist der Fehler eindeutig bei uns, reicht eine Nachricht an die Buchhaltung mit den drei Belegen. Bei Unklarheit, zum Beispiel bei mündlich zugesagten Preisen, entscheidet die Vertriebsleitung.

## Schritt 4: Korrekturrechnung oder Ablehnung

Die Buchhaltung erstellt eine Rechnungskorrektur oder Teilgutschrift, nie eine neue Rechnung mit neuer Nummer. Wird die Beanstandung abgelehnt, erklärt der Innendienst dem Kunden schriftlich die Berechnung und hebt die Mahnsperre auf.
`,
  },
  {
    slug: "versand-deutschland-eu",
    language: "de",
    kind: "knowledge",
    title: "Versand innerhalb Deutschlands und der EU",
    whenToUse: null,
    markdown: `Gilt für alle Lieferungen an Adressen in Deutschland und in den übrigen EU-Mitgliedstaaten. Für die Schweiz, Norwegen, Großbritannien und alle anderen Länder gilt Versand in Drittländer und Zoll.

## Versandarten

Pakete bis 31,5 kg gehen mit DHL, schwerere Sendungen und Paletten per Spedition. Für dringende Ersatzteile gibt es Express mit Zustellung am nächsten Werktag bis 12 Uhr innerhalb Deutschlands.

## Versandkosten

Deutschland: Paket 7,90 €, Express 29 €, Palette 89 €. EU: Paket 14,50 €, Palette je nach Zone zwischen 140 und 260 €. Ab 500 € Netto-Warenwert liefern wir Pakete innerhalb Deutschlands versandkostenfrei, in die EU ab 1.000 €.

## Bestellschluss

Lagerware, die bis 15:00 Uhr bestellt wird, verlässt das Lager am selben Tag. Express-Bestellungen müssen bis 16:30 Uhr im System sein. Speditionsware braucht einen Tag Vorlauf.

## Lieferzeiten EU

Standardpakete erreichen Österreich, Benelux und Frankreich in zwei bis drei Werktagen, Südeuropa und Skandinavien in drei bis fünf. Inseln wie Sardinien oder Mallorca dauern länger und kosten einen Inselzuschlag von 25 €.

## Innergemeinschaftliche Lieferung

Für steuerfreie Lieferungen an Firmenkunden in der EU muss eine gültige USt-IdNr. im Kundenstamm hinterlegt und geprüft sein. Fehlt sie, berechnen wir deutsche Umsatzsteuer. Zoll fällt innerhalb der EU nicht an.
`,
  },
  {
    slug: "versand-drittlaender-zoll",
    language: "de",
    kind: "knowledge",
    title: "Versand in Drittländer und Zoll",
    whenToUse: null,
    markdown: `Gilt für alle Lieferungen außerhalb der EU, also auch in die Schweiz, nach Norwegen und ins Vereinigte Königreich.

## Incoterms

Standard ist FCA Baunatal: Der Kunde oder sein Spediteur übernimmt ab unserer Rampe. DAP bieten wir nur für die Schweiz und Großbritannien an, DDP gar nicht, weil wir keine Einfuhrabgaben im Zielland abwickeln.

## Ausfuhranmeldung

Ab 1.000 € Warenwert erstellt der Versand eine elektronische Ausfuhranmeldung über ATLAS. Der Kunde bekommt das Ausgangsvermerk-PDF per E-Mail. Ohne Ausgangsvermerk dürfen wir die Rechnung nicht steuerfrei stellen.

## Schweiz und Norwegen

Für die Schweiz arbeiten wir mit einem Verzollungsdienstleister in Basel; der Kunde zahlt Schweizer Mehrwertsteuer und Gebühren bei Zustellung. Norwegen wird per Spedition mit Verzollung in Oslo beliefert, Laufzeit etwa fünf Werktage.

## Vereinigtes Königreich

Seit dem Brexit braucht jeder britische Kunde eine EORI-Nummer. Pakete unter 135 GBP verzollt der Paketdienst; darüber muss der Kunde einen eigenen Importagenten benennen. Eine Ursprungserklärung auf der Rechnung gibt es nur für Artikel mit EU-Präferenzursprung.

## Exportkontrolle

Einige Hochpräzisionslager und Steuerventile stehen auf der Dual-Use-Liste. Das ERP sperrt solche Aufträge automatisch, bis die Exportkontrolle freigibt. Lieferungen nach Russland und Belarus sind grundsätzlich ausgeschlossen.
`,
  },
  {
    slug: "crm-datenpflege",
    language: "de",
    kind: "knowledge",
    title: "CRM-Datenpflege: Regeln für saubere Stammdaten",
    whenToUse: null,
    markdown: `Saubere Daten sind die Grundlage für Forecast, Gebietsplanung und Marketing. Diese Regeln gelten für alle, die im CRM schreiben. Die Vertriebsassistenz prüft stichprobenartig und spricht wiederholte Lücken in der Teamrunde an.

## Pflichtfelder am Firmendatensatz

Jede Firma braucht den vollständigen Namen laut Handelsregister, Land, Kundengruppe (H oder I), den zuständigen Außendienst und die Branche. Ohne Kundengruppe kann kein Angebot erzeugt werden.

## Dubletten vermeiden

Vor dem Anlegen immer nach Name, Domain und USt-IdNr. suchen. Gefundene Dubletten nicht selbst löschen, sondern mit dem Tag dublette markieren; die Vertriebsassistenz führt sie freitags zusammen.

## Ansprechpartner pflegen

Personen werden immer mit Funktion und direkter Telefonnummer angelegt. Wer das Unternehmen verlassen hat, wird nicht gelöscht, sondern auf inaktiv gesetzt, damit die Historie erhalten bleibt.

## Aktivitäten dokumentieren

Jedes Kundengespräch, das Preise, Termine oder Probleme betrifft, wird spätestens am Folgetag als Notiz erfasst. Eine Zeile reicht: Wer, was vereinbart, nächster Schritt.

## Monatlicher Datencheck

Am ersten Montag im Monat bekommt jede Person im Vertrieb eine Liste mit Datensätzen ohne Branche, ohne Ansprechpartner oder ohne Aktivität seit zwölf Monaten und bereinigt sie innerhalb einer Woche.
`,
  },
  {
    slug: "lead-qualifizierung",
    language: "de",
    kind: "knowledge",
    title: "Lead-Qualifizierung",
    whenToUse: null,
    markdown: `Wie aus einer Anfrage ein Deal für den Außendienst wird. Ziel ist, dass der Außendienst seine Zeit nur für Anfragen mit echtem Potenzial verwendet. Die Vertriebsassistenz betreut alle Leads bis zur Übergabe.

## Woher Leads kommen

Anfragen über das Webformular, Messen, Händlerempfehlungen und Anrufe landen als Lead im CRM. Die Vertriebsassistenz ordnet jeden Lead innerhalb eines Arbeitstags einem Gebiet zu.

## Qualifizierungskriterien

Ein Lead gilt als qualifiziert, wenn vier Punkte geklärt sind: konkreter Bedarf an unseren Produktlinien, geschätztes Jahresvolumen über 5.000 €, Kontakt zu einer Person mit Kaufentscheidung oder Einfluss darauf und ein Zeitrahmen unter sechs Monaten.

## Lead-Bewertung

Das CRM vergibt Punkte: Branche Maschinenbau oder Lebensmittelindustrie plus 20, mehr als 50 Mitarbeitende plus 15, Anfrage mit Stückliste plus 25, Freemail-Adresse minus 10. Ab 50 Punkten wird der Lead als heiß markiert und sofort angerufen.

## Übergabe an den Außendienst

Qualifizierte Leads werden in einen Deal umgewandelt und dem Außendienst des Gebiets zugewiesen, mit einer Notiz zu Bedarf und nächstem Schritt. Der Außendienst meldet sich binnen drei Arbeitstagen beim Interessenten.

## Disqualifizieren

Privatpersonen, Wettbewerber und Anfragen außerhalb unseres Sortiments werden mit Grund auf disqualifiziert gesetzt, nicht gelöscht.
`,
  },
  {
    slug: "verkaufsphasen",
    language: "de",
    kind: "knowledge",
    title: "Verkaufsphasen im CRM",
    whenToUse: null,
    markdown: `Jeder Deal durchläuft dieselben Phasen. Die Wahrscheinlichkeit wird vom CRM aus der Phase gesetzt und darf nicht von Hand überschrieben werden.

## Phase 1: Erstkontakt

Der Deal startet, sobald ein qualifizierter Lead übergeben wurde. Wahrscheinlichkeit 10 %. Pflicht ist nur der Ansprechpartner.

## Phase 2: Bedarfsanalyse

Termin oder Telefonat hat stattgefunden, Artikel und Mengen sind grob bekannt. Wahrscheinlichkeit 25 %. Pflicht sind erwarteter Auftragswert und Abschlussdatum.

## Phase 3: Angebot versendet

Das freigegebene Angebot ist beim Kunden. Wahrscheinlichkeit 50 %. Nach zehn Tagen ohne Reaktion ist ein Nachfassanruf Pflicht.

## Phase 4: Verhandlung

Der Kunde verhandelt Preis, Lieferzeit oder Konditionen. Wahrscheinlichkeit 75 %. Jede Preisänderung braucht eine neue Angebotsversion, damit die Historie nachvollziehbar bleibt.

## Gewonnen oder verloren

Gewonnen, sobald die Bestellung im ERP ist. Verloren nur mit Pflichtgrund: Preis, Lieferzeit, Wettbewerber, Projekt gestoppt oder keine Rückmeldung. Deals ohne Aktivität seit 90 Tagen werden automatisch auf verloren mit dem Grund keine Rückmeldung gesetzt.

## Pflege der Phasen

Die Phase pflegt immer die für den Deal verantwortliche Person, nicht die Vertriebsassistenz. Rückschritte sind erlaubt, etwa von Verhandlung zurück zu Bedarfsanalyse, wenn der Kunde den Umfang grundlegend ändert. Wer eine Phase überspringt, muss deren Pflichtfelder trotzdem nachtragen, sonst lässt das CRM den Wechsel nicht zu.
`,
  },
  {
    slug: "key-account-betreuung",
    language: "de",
    kind: "knowledge",
    title: "Key-Account-Betreuung",
    whenToUse: null,
    markdown: `Regeln für die Betreuung unserer wichtigsten Kunden. Key Accounts machen rund 45 Prozent unseres Umsatzes aus. Jeder hat genau einen verantwortlichen Key-Account-Manager im Außendienst.

## Wer ist ein Key Account

Key Accounts sind Kunden mit mehr als 250.000 € Jahresumsatz oder strategischer Bedeutung, zum Beispiel Konzerne mit mehreren Werken. Die Liste pflegt die Vertriebsleitung; aktuell sind es 34 Firmen.

## Account-Plan

Für jeden Key Account gibt es einen Account-Plan im CRM: Ziele für das Jahr, Organigramm des Kunden, Wettbewerber im Werk und Risiken. Er wird jedes Jahr im Januar erstellt und im Juli überprüft.

## Regelmäßige Termine

Der Key-Account-Manager führt mindestens vierteljährlich ein Gespräch mit dem Einkauf und einmal im Jahr einen Werksbesuch mit der Technik durch. Ergebnisse gehören als Notiz an die Firma.

## Sonderkonditionen

Key Accounts haben oft individuelle Rahmenverträge mit eigenen Preisen, Konsignationslager oder verlängertem Zahlungsziel bis 90 Tage. Diese Abweichungen stehen im Feld Sonderkonditionen und haben Vorrang vor allen allgemeinen Regeln.

## Vertretung bei Abwesenheit

Jeder Key Account hat einen benannten Stellvertreter aus dem Innendienst. Bei Urlaub über fünf Tage informiert der Key-Account-Manager den Kunden vorab schriftlich, wer zuständig ist.
`,
  },
  {
    slug: "kundeneskalation",
    language: "de",
    kind: "procedure",
    title: "Kundeneskalation",
    whenToUse:
      "Wenn ein Kunde mit Kündigung, Lieferantenwechsel oder rechtlichen Schritten droht oder ein Problem trotz Klärungsversuch ungelöst bleibt.",
    markdown: `So wird ein kritischer Kundenfall an die richtige Stelle gebracht.

## Eskalationsstufen

Stufe 1 ist die Teamleitung Innendienst, Stufe 2 die Vertriebsleitung, Stufe 3 die Geschäftsführung. Normalerweise beginnt man bei Stufe 1; bei Key Accounts oder Produktionsstillstand direkt bei Stufe 2.

## Schritt 1: Sachverhalt zusammenfassen

Schreibe in höchstens zehn Zeilen: Kunde, Problem, bisherige Schritte, finanzieller Schaden, Forderung des Kunden. Hänge die relevanten Belege an.

## Schritt 2: Eskalation melden

Setze am Deal oder an der Firma den Tag eskalation, weise die Aufgabe der nächsten Stufe zu und ruf zusätzlich an. Eine E-Mail allein reicht nicht.

## Reaktionszeiten

Stufe 1 meldet sich innerhalb von vier Arbeitsstunden, Stufe 2 am selben Tag, Stufe 3 innerhalb von 24 Stunden. Der Kunde erhält spätestens am nächsten Werktag eine persönliche Rückmeldung.

## Abschluss und Nachbereitung

Nach der Lösung trägt die zuständige Person die Maßnahme und die Ursache in die Aufgabe ein. Eskalationen werden monatlich in der Vertriebsrunde besprochen.

## Was keine Eskalation ist

Eine normale Preisverhandlung, eine einzelne verspätete Lieferung mit neuem Termin oder eine Reklamation im üblichen Ablauf sind keine Eskalation. Diese Fälle laufen über die jeweiligen Seiten und bleiben beim Innendienst. Eskaliert wird erst, wenn der Kunde selbst Konsequenzen ankündigt oder wir eine zugesagte Frist zum zweiten Mal nicht halten.
`,
  },
  {
    slug: "urlaub-abwesenheiten",
    language: "de",
    kind: "knowledge",
    title: "Urlaub und Abwesenheiten",
    whenToUse: null,
    markdown: `Regeln für geplante und ungeplante Abwesenheiten im Vertrieb und im Lager.

## Urlaubsanspruch und Antrag

Vollzeitkräfte haben 30 Tage Urlaub im Jahr. Anträge laufen über das Personalportal und sollten mindestens vier Wochen vorher gestellt werden; für bis zu drei Tage reicht eine Woche Vorlauf.

## Urlaubssperren

Während der Jahresinventur, also an den letzten zwei Arbeitstagen im Dezember, und in der Woche der Hannover Messe gilt für Vertrieb und Lager eine Urlaubssperre. Ausnahmen genehmigt nur die Bereichsleitung.

## Vertretungsregel

Jede Abwesenheit über zwei Tage braucht eine eingetragene Vertretung im CRM-Kalender. Offene Angebote und Aufgaben werden vorher übergeben, nicht nur weitergeleitet.

## Abwesenheitsnotiz

Die automatische Antwort nennt Rückkehrdatum und die Vertretung mit Telefonnummer, auf Deutsch und Englisch. Sie enthält keine Angaben zum Grund der Abwesenheit.

## Krankmeldung

Bis 9 Uhr telefonisch bei der Teamleitung melden, ab dem dritten Tag ist eine Arbeitsunfähigkeitsbescheinigung nötig. Die elektronische Bescheinigung ruft die Personalabteilung selbst ab.

## Resturlaub

Nicht genommener Urlaub kann bis zum 31. März des Folgejahres übertragen werden. Danach verfällt er, sofern die Personalabteilung rechtzeitig schriftlich darauf hingewiesen hat. Eine Auszahlung von Urlaubstagen gibt es nur beim Austritt.
`,
  },
  {
    slug: "rufbereitschaft",
    language: "de",
    kind: "knowledge",
    title: "Rufbereitschaft (Notdienst)",
    whenToUse: null,
    markdown: `Außerhalb der Geschäftszeiten betreut ein kleiner Notdienst dringende Kundenfälle.

## Wofür es den Notdienst gibt

Industriekunden mit Wartungsvertrag können bei Maschinenstillstand außerhalb der Geschäftszeiten Ersatzteile anfordern. Der Notdienst klärt die Verfügbarkeit und organisiert Kurier oder Abholung.

## Zeiten und Besetzung

Montag bis Freitag von 17:00 bis 22:00 Uhr sowie Samstag von 8:00 bis 14:00 Uhr. Eingeteilt werden jeweils eine Person aus dem Innendienst und eine aus dem Lager, im Wochenwechsel. Der Plan steht im Teamkalender.

## Erreichbarkeit

Die Notdienstnummer wird auf das Diensthandy der eingeteilten Person umgeleitet. Rückruf innerhalb von 30 Minuten; bei Stillstand muss der Kunde spätestens nach zwei Stunden wissen, wann die Teile kommen.

## Vergütung

Pro Woche Bereitschaft gibt es eine Pauschale von 180 €. Tatsächliche Einsätze werden als Arbeitszeit mit 25 % Zuschlag vergütet, am Samstag mit 50 %.

## Tausch von Diensten

Dienste dürfen untereinander getauscht werden, wenn der Teamkalender vorher angepasst und die Teamleitung informiert ist.

## Einsätze dokumentieren

Jeder Einsatz wird noch am selben Abend als Aufgabe am Kunden erfasst: Uhrzeit des Anrufs, benötigte Teile, gewählter Transport und Uhrzeit der Übergabe. Die Arbeitszeit trägst du am nächsten Werktag im Personalportal mit dem Vermerk Notdienst ein. Kosten für Kurier oder Taxi laufen über die Kostenstelle Notdienst, nicht über die Reisekosten.
`,
  },
  {
    slug: "passwort-sicherheitsrichtlinie",
    language: "de",
    kind: "knowledge",
    title: "Passwort- und Sicherheitsrichtlinie",
    whenToUse: null,
    markdown: `Verbindliche Regeln der IT für alle Mitarbeitenden und externen Kräfte.

## Anforderungen an Passwörter

Mindestens 14 Zeichen, keine Wiederverwendung der letzten zehn Passwörter. Ein Wechsel ist nicht regelmäßig vorgeschrieben, nur bei Verdacht auf Kompromittierung.

## Zwei-Faktor-Anmeldung

Für E-Mail, CRM, ERP und VPN ist die Zwei-Faktor-Anmeldung per Authenticator-App Pflicht. SMS-Codes sind nicht erlaubt.

## Passwortmanager

Alle Zugangsdaten gehören in den Firmen-Passwortmanager. Geteilte Zugänge, etwa für Lieferantenportale, liegen in gemeinsamen Tresoren des Teams und werden niemals per E-Mail oder Chat verschickt.

## Bildschirmsperre und Geräte

Den Laptop beim Verlassen des Platzes sperren. USB-Sticks aus unbekannter Quelle nicht anschließen. Private Geräte dürfen nicht ins Firmennetz, nur ins Gästenetz.

## Verstöße

Wiederholte Verstöße meldet die IT der Führungskraft. Einen Vorfall, etwa einen angeklickten verdächtigen Link, sofort melden, siehe Report a security incident.

## Arbeiten von unterwegs

Von unterwegs und aus dem Homeoffice arbeitest du ausschließlich über das VPN. Öffentliche WLANs in Hotels oder Zügen sind erlaubt, solange das VPN aktiv ist. In der Bahn eine Sichtschutzfolie verwenden, wenn Preislisten oder Kundendaten geöffnet sind. Ausdrucke mit Kundendaten gehören nicht in den Hausmüll, sondern in die verschlossenen Datenschutztonnen an jedem Standort.
`,
  },
  {
    slug: "dsgvo-anfragen",
    language: "de",
    kind: "procedure",
    title: "DSGVO-Anfragen bearbeiten",
    whenToUse:
      "Wenn eine Person Auskunft über ihre gespeicherten Daten, deren Berichtigung oder Löschung verlangt oder der Verarbeitung widerspricht.",
    markdown: `Ablauf für Betroffenenanfragen nach der Datenschutz-Grundverordnung. Feste Aufbewahrungsfristen stehen auf der Seite Data retention schedule. Verantwortlich ist der Datenschutzkoordinator; der Vertrieb erkennt die Anfrage nur und leitet sie weiter.

## Schritt 1: Anfrage erkennen und weiterleiten

Anfragen können formlos kommen, auch per Telefon oder im Nebensatz einer E-Mail. Leite sie am selben Tag an das Datenschutz-Postfach weiter und antworte der Person nicht inhaltlich.

## Schritt 2: Identität prüfen

Der Datenschutzkoordinator prüft, ob die Anfrage von der betroffenen Person selbst stammt, etwa über die bekannte E-Mail-Adresse. Keine Ausweiskopien anfordern, außer es gibt ernsthafte Zweifel.

## Schritt 3: Frist beachten

Die Antwort muss innerhalb eines Monats nach Eingang erfolgen. Eine Verlängerung um zwei Monate ist nur bei komplexen Fällen möglich und muss der Person innerhalb des ersten Monats begründet werden.

## Schritt 4: Daten zusammenstellen oder löschen

Bei einer Auskunft exportiert der Koordinator alle Daten aus CRM, ERP und Newsletter-Tool. Bei einer Löschung werden Kontaktdaten im CRM anonymisiert; Rechnungen bleiben wegen der Aufbewahrungspflicht zehn Jahre gespeichert.

## Schritt 5: Dokumentieren

Jede Anfrage wird im Datenschutzregister mit Eingangsdatum, Art, Antwortdatum und Ergebnis erfasst.
`,
  },
  {
    slug: "partnerprogramm",
    language: "de",
    kind: "knowledge",
    title: "Partnerprogramm für Wiederverkäufer",
    whenToUse: null,
    markdown: `Das Partnerprogramm bindet Händler langfristig an Hallberg. Die Rabatte selbst stehen auf der Seite Rabattregeln Fachhandel und Wiederverkäufer. Aktuell sind rund 120 Händler im Programm, davon zwölf auf der Gold-Stufe. Die Betreuung liegt beim Partnermanagement in der Vertriebsleitung.

## Partnerstufen

Das Programm hat drei Stufen: Bronze ab 50.000 €, Silber ab 150.000 € und Gold ab 400.000 € Jahresumsatz mit Hallberg. Die Stufe bestimmt den Grundrabatt.

## Aufnahmevoraussetzungen

Ein Händler braucht einen Gewerbenachweis, ein eigenes Lager oder Ladenlokal, mindestens eine geschulte Person für Technikfragen und muss unsere Markenrichtlinien einhalten. Reine Marktplatzhändler ohne eigenen Shop nehmen wir nicht auf.

## Leistungen für Partner

Partner erhalten Zugang zum Händlerportal mit Echtzeitbeständen, kostenlose Produktschulungen und Marketingmaterial, ab Silber zusätzlich einen festen Ansprechpartner. Gold-Partner bekommen außerdem Werbekostenzuschüsse.

## Projektschutz

Partner können Projekte über das Portal registrieren. Eine registrierte Chance ist 90 Tage geschützt: Andere Händler bekommen für dasselbe Endkundenprojekt keine besseren Konditionen, und unser Außendienst bietet nicht direkt an.

## Kündigung und Herabstufung

Unterschreitet ein Partner zwei Jahre in Folge die Umsatzschwelle, wird er eine Stufe herabgesetzt. Verstöße gegen die Markenrichtlinien können zur Kündigung mit drei Monaten Frist führen.
`,
  },
  {
    slug: "produktlinien",
    language: "de",
    kind: "knowledge",
    title: "Produktlinien im Überblick",
    whenToUse: null,
    markdown: `Kurzer Überblick über das Sortiment für Gespräche mit Kunden. Details und Datenblätter liegen im Produktkatalog im ERP.

## Wälzlager

Rillenkugellager, Zylinderrollenlager und Pendellager von drei Premiumherstellern sowie unserer Hausmarke HALCO. Rund 12.000 Artikel ab Lager, Sondergrößen mit zwei bis sechs Wochen Lieferzeit.

## Dichtungen und O-Ringe

Radialwellendichtringe, O-Ringe in NBR, FKM und EPDM sowie Hydraulikdichtungen. Auf Wunsch schneiden wir O-Ring-Schnur auf Maß und vulkanisieren sie.

## Pneumatik

Zylinder, Ventile, Wartungseinheiten und Schläuche. Die Hausmarke HALCO deckt Standardzylinder nach ISO 15552 ab; Ventilinseln liefern wir nur über Partnerhersteller.

## Antriebstechnik

Keilriemen, Zahnriemen, Kettenräder, Kupplungen und Getriebemotoren bis 7,5 kW. Zahnriemen werden in Baunatal auf Länge konfektioniert.

## Normteile und Befestigung

Schrauben, Muttern und Stifte nach DIN und ISO in Stahl und Edelstahl, meist in Verpackungseinheiten zu 100 oder 500 Stück. Einzelstücke verkaufen wir nicht.

## Nicht im Sortiment

Wir führen keine Elektronik, keine Sensoren und keine Hydraulikaggregate. Solche Anfragen werden als Lead disqualifiziert.

## Hausmarke HALCO

HALCO ist unsere Eigenmarke für Standardartikel mit hohem Absatz: Kugellager, Pneumatikzylinder und O-Ringe. Die Qualität entspricht den Premiumherstellern, der Preis liegt etwa 20 bis 30 Prozent darunter. HALCO-Artikel eignen sich als Alternative, wenn ein Markenartikel nicht verfügbar ist.
`,
  },
  {
    slug: "zahlungsbedingungen-mahnwesen",
    language: "de",
    kind: "knowledge",
    title: "Zahlungsbedingungen und Mahnwesen",
    whenToUse: null,
    markdown: `Standardbedingungen für alle Kunden. Abweichungen für Key Accounts stehen im jeweiligen Vertrag. Fragen zu einzelnen offenen Posten beantwortet die Buchhaltung, nicht der Vertrieb.

## Zahlungsziele

Standard sind 30 Tage netto. Neukunden zahlen die ersten drei Aufträge per Vorkasse oder, nach positiver Bonitätsprüfung, bis 2.000 € auf Rechnung. Längere Ziele gibt es nur für Key Accounts laut Vertrag.

## Skonto

2 % Skonto bei Zahlung innerhalb von zehn Tagen, nicht auf Fracht und Mindermengenzuschläge. Wird Skonto nach Fristablauf abgezogen, fordert die Buchhaltung den Betrag einmal nach und bucht ihn danach aus, wenn er unter 50 € liegt.

## Mahnstufen

Die erste Zahlungserinnerung geht 7 Tage nach Fälligkeit raus, die zweite Mahnung nach 21 Tagen mit 5 € Gebühr, die dritte nach 35 Tagen mit Androhung des Inkassos. Ab der zweiten Mahnung wird der Kunde für neue Aufträge gesperrt.

## Kreditlimit

Jeder Kunde hat ein Kreditlimit im ERP. Aufträge, die das Limit überschreiten, gehen in die Freigabe der Buchhaltung. Eine Erhöhung beantragt der Außendienst mit einer aktuellen Auskunft der Kreditversicherung.

## Liefersperre aufheben

Nach Zahlungseingang hebt die Buchhaltung die Sperre am selben Tag auf. Dringende Aufträge während der Sperre gehen nur gegen Vorkasse raus.
`,
  },
  {
    slug: "angebot-erstellen",
    language: "de",
    kind: "procedure",
    title: "Angebot erstellen und freigeben",
    whenToUse:
      "Wenn ein Kunde ein schriftliches Angebot mit Preisen anfragt oder ein Deal in die Phase Angebot wechseln soll.",
    markdown: `Jedes Angebot entsteht im ERP und wird im CRM am Deal verfolgt.

## Schritt 1: Vorlage wählen

Im ERP die Vorlage nach Kundengruppe wählen: Handel, Industrie oder Export. Die Vorlage Export enthält die Incoterms und den Hinweis zur Exportkontrolle.

## Schritt 2: Positionen und Preise

Artikelnummern aus der Anfrage übernehmen, die Lieferzeit je Position prüfen und Rabatte nach den Rabattregeln der Kundengruppe setzen. Alternativartikel als optionale Position aufführen.

## Schritt 3: Gültigkeit

Angebote gelten 30 Tage. Bei Artikeln mit Metallzuschlag oder schwankenden Rohstoffpreisen höchstens 14 Tage; das steht im Kopftext.

## Schritt 4: Freigabe

Liegt der Rabatt über deiner eigenen Freigabegrenze oder der Angebotswert über 50.000 €, das Angebot im CRM zur Freigabe einreichen. Die Freigabe wird am Angebot dokumentiert, nicht per Chat.

## Schritt 5: Versand und Nachfassen

Das PDF aus dem ERP an den Kunden schicken, im CRM den Deal auf Angebot versendet setzen und eine Nachfass-Aufgabe in zehn Tagen anlegen.

## Sonderfälle

Bei Ausschreibungen öffentlicher Auftraggeber gelten deren Formulare; das ERP-Angebot wird dann nur als interne Kalkulation angelegt. Fragt ein Kunde am Telefon nur nach einem Richtpreis, wird kein Angebot angelegt, sondern eine Notiz am Deal. Angebote für Sonderanfertigungen brauchen immer eine technische Klärung durch das Produktmanagement.
`,
  },
  {
    slug: "neukunden-anlegen",
    language: "de",
    kind: "procedure",
    title: "Neukunden anlegen",
    whenToUse: "Wenn eine Firma zum ersten Mal bestellen möchte und noch keine Kundennummer hat.",
    markdown: `Ablauf vom ersten Kontakt bis zur fertigen Kundennummer.

## Schritt 1: Dublettenprüfung

Suche im CRM nach Name, Domain und USt-IdNr. Existiert die Firma schon, etwa als ehemaliger Kunde, wird sie reaktiviert statt neu angelegt.

## Schritt 2: Bonitätsprüfung

Für einen Rechnungskauf über 2.000 € eine Auskunft der Kreditversicherung einholen. Ist die Bonität schlecht oder unbekannt, nur gegen Vorkasse liefern.

## Schritt 3: Umsatzsteuer-ID prüfen

Bei EU-Kunden außerhalb Deutschlands die USt-IdNr. über das Bestätigungsverfahren des Bundeszentralamts für Steuern prüfen und das Ergebnis als PDF am Datensatz ablegen.

## Schritt 4: Stammdaten erfassen

Firma mit allen Pflichtfeldern, Rechnungs- und Lieferadresse sowie Ansprechpartnern für Einkauf und Buchhaltung anlegen. Die Kundennummer vergibt das ERP automatisch nach der Synchronisation, meist innerhalb von 15 Minuten.

## Schritt 5: Willkommensmail

Die Vorlage Willkommen mit Zahlungsbedingungen, Ansprechpartner und Link zum Kundenportal schicken.

## Häufige Fehler

Die häufigsten Fehler beim Anlegen sind eine fehlende Lieferadresse bei abweichendem Werk, eine private E-Mail-Adresse als Rechnungsempfänger und eine falsche Kundengruppe. Eine falsche Kundengruppe führt dazu, dass Angebote mit den falschen Rabatten entstehen; korrigieren kann sie nur die Vertriebsassistenz, weil daran die Preisfindung im ERP hängt. Firmen mit mehreren Standorten bekommen je Standort eine eigene Lieferadresse, aber nur eine Rechnungsadresse.
`,
  },
  {
    slug: "messen-veranstaltungen",
    language: "de",
    kind: "knowledge",
    title: "Messen und Kundenveranstaltungen",
    whenToUse: null,
    markdown: `Messen sind unsere wichtigste Quelle für Neukunden. Das Marketing organisiert, der Vertrieb besetzt. Das Messebudget liegt beim Marketing; Standpersonal und Reisekosten tragen die jeweiligen Vertriebsteams.

## Messekalender

Fest eingeplant sind die Hannover Messe im April, die Motek in Stuttgart im Oktober und die SPS in Nürnberg im November. Über weitere regionale Hausmessen entscheidet das Marketing bis Ende Januar.

## Standdienst

Jede Person im Außendienst übernimmt mindestens zwei Messetage pro Jahr. Die Einteilung erfolgt acht Wochen vorher; getauscht wird nur über das Marketing.

## Kontakte vom Stand erfassen

Visitenkarten werden am Stand mit der Scanner-App erfasst und landen als Lead mit der Quelle Messe im CRM. Spätestens drei Tage nach Messeende muss jeder Kontakt eine Notiz zum Gesprächsinhalt haben.

## Kundenveranstaltungen

Zweimal im Jahr gibt es in Baunatal einen Technik-Tag für Kunden mit Werksführung und Vorträgen. Einladungen verschickt das Marketing, der Außendienst meldet bis vier Wochen vorher seine Wunschgäste.

## Geschenke und Einladungen

Werbegeschenke bis 35 € pro Person und Jahr sind erlaubt. Einladungen zu Essen oder Veranstaltungen über 100 € pro Person müssen vorher von der Compliance freigegeben werden.
`,
  },
  {
    slug: "dienstreisen-reisekosten",
    language: "de",
    kind: "knowledge",
    title: "Dienstreisen und Reisekosten",
    whenToUse: null,
    markdown: `Regeln für Reisen zu Kunden, Messen und Schulungen.

## Buchung

Bahn und Hotels bucht jede Person selbst über das Reiseportal. Flüge nur bei mehr als 500 km Strecke und mit Freigabe der Führungskraft.

## Hotel und Verpflegung

Hotelkosten bis 120 € pro Nacht, in München, Hamburg und Frankfurt bis 160 €. Verpflegungspauschalen nach den steuerlichen Sätzen; bei gestelltem Frühstück wird gekürzt.

## Fahrten mit dem Auto

Mit dem Privatwagen werden 0,30 € pro Kilometer erstattet. Mietwagen nur, wenn die Bahn nicht sinnvoll ist, und höchstens in der Kompaktklasse.

## Abrechnung

Die Reisekostenabrechnung muss innerhalb von vier Wochen nach der Reise mit allen Belegen im Personalportal eingereicht werden. Später eingereichte Kosten werden nur mit Begründung erstattet.

## Vorschuss

Für Reisen über eine Woche oder ins Ausland kann ein Vorschuss beantragt werden, spätestens zehn Tage vor Abreise.

## Reisen ins Ausland

Vor Reisen außerhalb der EU prüft die Personalabteilung, ob ein Visum nötig ist. Für jeden Kundenbesuch im EU-Ausland brauchst du außerdem eine A1-Bescheinigung für die Sozialversicherung; beantrage sie mindestens zwei Wochen vor Abreise. Für Auslandsreisen gelten die Verpflegungspauschalen des jeweiligen Landes.
`,
  },
  {
    slug: "operating-guide",
    language: "en",
    kind: "guide",
    title: "Sales and Support Operating Guide",
    whenToUse: null,
    markdown: `The starting point for everyone in sales and customer support at Hallberg Industrietechnik.

## How we work

Hallberg sells bearings, seals, pneumatics, drive components and standard parts to resellers and industrial customers across the EU. Inside sales handles quotes, orders and customer questions; field sales owns accounts and new business; quality assurance decides on defects.

## Where to look first

Money questions such as discounts, prices and payment terms live in the discount and payment pages. Anything about goods coming back splits three ways: unwanted goods are returns, broken goods are complaints, wrong amounts are invoice disputes. Shipping pages are split by EU and non-EU destinations.

## Language of customer communication

Write to customers in their language when we have a native speaker on the team (German, English, French, Italian, Spanish, Dutch); otherwise use English. Contracts and terms are always sent in German and English.

## Recording work

If it is not in the CRM, it did not happen. Every call, promise and deadline goes onto the company or deal record the same or next day.

## When the wiki is wrong

Anyone can fix a page. If you are unsure whether a rule changed, ask the page owner rather than guessing, and correct the page afterwards.
`,
  },
  {
    slug: "tool-access",
    language: "en",
    kind: "knowledge",
    title: "Tool access and accounts",
    whenToUse: null,
    markdown: `Which systems we use and how people get into them.

## Tools we use

The CRM for customers, deals and tasks; the ERP for orders, stock and invoices; the dealer portal for resellers; the HR portal for leave and expenses; the password manager; and the learning platform for mandatory courses.

## Requesting access

Your team lead requests access through the IT service desk form. Standard CRM and ERP access for sales is granted within one working day. Admin rights in the CRM require approval from the head of sales.

## Shared mailboxes

Inside sales works from the shared mailboxes orders@, quotes@ and returns@. Ask IT to add you. Never set up forwarding from a shared mailbox to a personal address.

## Leaving the company or changing teams

On the last working day IT disables all accounts at 17:00. Open deals and tasks must be reassigned by the team lead a week before. When changing teams, access to the old team's shared mailboxes is removed after two weeks.

## Access for contractors

Temporary staff and contractors get time-limited accounts that expire automatically at the contract end date, at most six months, and never receive ERP write access.
`,
  },
  {
    slug: "support-service-levels",
    language: "en",
    kind: "knowledge",
    title: "Customer support service levels",
    whenToUse: null,
    markdown: `What customers can expect from inside sales and how we measure it. These targets apply to every customer; key accounts may have stricter targets in their contracts.

## Opening hours

Inside sales is reachable Monday to Friday, 7:30 to 17:00 CET. Outside these hours only customers with a maintenance contract can use the on-call number.

## Priority levels

P1: a machine at the customer is down because of a part we supply. P2: an order is at risk or wrong goods were delivered. P3: general questions, quotes and documents.

## Response targets

P1 within 30 minutes by phone, P2 within four business hours, P3 within one business day. An email counts as answered when the customer gets a substantive reply, not an automatic acknowledgement.

## Channels

Phone and email are the official channels. Messages via LinkedIn or personal WhatsApp must be moved to email and logged in the CRM before any commitment is made.

## Measuring

The team lead reviews first-response times weekly from the CRM task report. Two missed P1 targets in a month trigger a review in the sales meeting.
`,
  },
  {
    slug: "returns-outside-germany",
    language: "en",
    kind: "knowledge",
    title: "Returns from customers outside Germany",
    whenToUse: null,
    markdown: `Extends the German returns page (Rückgaben und Gutschriften) for customers in other EU countries and outside the EU. The 30-day window, the condition rules and the excluded items are the same.

## Return shipping costs

EU customers send returns at their own cost via a carrier of their choice, or we issue a DHL return label and deduct 18 € from the credit. For customers outside the EU we do not provide labels.

## Customs on returns from non-EU countries

Goods coming back from Switzerland, Norway or the UK must be declared as returned goods with reference to our original export declaration, otherwise we pay import duty. Ask the customer to attach a copy of our invoice and the export reference; shipping cannot book the goods in without it.

## Refund currency and bank fees

Credits are always issued in euro. If a customer insists on a payout instead of a credit note, bank charges for foreign transfers are borne by the customer.

## Collection points in Italy and Spain

Customers in Italy and Spain can drop returns at our logistics partner's hubs in Milan and Zaragoza, which consolidate them weekly to Baunatal. This takes up to two weeks longer but costs the customer nothing.
`,
  },
  {
    slug: "pricing-eu-distributors",
    language: "en",
    kind: "knowledge",
    title: "Pricing for EU distributors",
    whenToUse: null,
    markdown: `For resellers outside Germany. German resellers follow Rabattregeln Fachhandel und Wiederverkäufer. Country managers in sales own the relationship with each distributor.

## Country price lists

Distributors in France, Italy, Spain and Benelux buy from country price lists that already include local freight and a market adjustment. Do not apply the German list plus discount.

## Volume tiers

Tiers are based on the previous year's purchases: under 100,000 € is tier A with no extra discount, 100,000 to 300,000 € is tier B with 3 % extra, and above 300,000 € is tier C with 6 % extra. Tiers are reviewed each February.

## Currency

All prices are in euro. For distributors in Poland, the Czech Republic and Hungary we invoice in euro only; local-currency invoicing is not offered.

## Price increases

Price list changes are announced to distributors at least 60 days in advance, usually for 1 April. Orders confirmed before the effective date are delivered at the old price even if they ship later.

## Exclusivity

We do not grant territorial exclusivity. A distributor may be named preferred partner for a region if it holds stock worth at least 50,000 € of our range.
`,
  },
  {
    slug: "special-price-request",
    language: "en",
    kind: "procedure",
    title: "Request a special price",
    whenToUse:
      "When a customer asks for a price below what your own approval limit allows, or a competitor has offered lower.",
    markdown: `How to get a price below the standard discount rules approved.

## Step 1: Check whether a special price is justified

Special prices need a reason: a competing offer in writing, project volume, or a strategic new account. Customer pressure alone is not enough.

## Step 2: Create the request in the CRM

On the deal, add a task of type price approval with the items, quantities, requested net price and current margin, and attach the competing offer.

## Step 3: Approval chain

The approver depends on the customer group and the size of the discount; the limits are on the discount pages for resellers and for industrial customers. Approvers answer within one business day. If nobody answers, call instead of re-sending the task.

## Step 4: Tell the customer

Only communicate the price after the approval is recorded on the task. Put it in a new quote version with a validity of at most 30 days and a note that the price is project-specific.

## Step 5: Review after the deal

If the deal is lost despite the special price, record the competitor's final price in the loss reason so that pricing can learn from it.
`,
  },
  {
    slug: "competitors-objections",
    language: "en",
    kind: "knowledge",
    title: "Competitors and objection handling",
    whenToUse: null,
    markdown: `Who we compete with and how to answer the most common objections.

## Main competitors

Our main competitors are two national catalogue distributors and the direct sales teams of the big bearing manufacturers. Online marketplaces win on small orders of standard parts.

## When the customer says we are too expensive

Ask what the comparison includes: delivery time, freight, minimum order value, technical support. Our strength is same-day dispatch and advice by engineers; lead with the cost of downtime, not the unit price.

## When delivery times are the objection

Check live stock in the ERP before answering. For recurring items suggest a consignment stock or a call-off order so the parts are reserved.

## Customers switching from a competitor

New customers switching from a competitor can get a one-time welcome discount of 5 % on the first order, on top of the regular discount, approved by the team lead.

## What we never say

Never make claims about a competitor's quality, financial situation or legal problems, even if the customer brings them up.
`,
  },
  {
    slug: "onboarding-international-reps",
    language: "en",
    kind: "knowledge",
    title: "Onboarding for international sales reps",
    whenToUse: null,
    markdown: `For sales staff working remotely from France, Italy, Spain or the Benelux. Office staff in Germany follow Onboarding für neue Mitarbeitende.

## Before day one

Your laptop and phone are shipped to your home address one week before your start date. Please be at home to sign for the parcel; the IT team calls you on day one to finish the setup remotely.

## First two weeks in Kassel

You spend your first two weeks at headquarters. The company books hotel and travel. You meet inside sales, quality and logistics and sit in on customer calls.

## German language course

German is not required, but we pay for an online course with two lessons per week in your first year if you want one. Many internal documents are in German; use the translation tool in the browser.

## Product training

Product training covers the same modules as for staff in Germany but is delivered in English over video calls, one module per week.

## Your buddy

Each international rep has a buddy in inside sales who handles their orders and speaks their language where possible.
`,
  },
  {
    slug: "report-security-incident",
    language: "en",
    kind: "procedure",
    title: "Report a security incident",
    whenToUse:
      "When you clicked a suspicious link or attachment, lost a laptop or phone, or see signs that someone accessed an account.",
    markdown: `Speed matters more than being sure. Report first, investigate later. Nobody gets into trouble for reporting a false alarm; the damage comes from waiting.

## Step 1: Disconnect

If you think your laptop is infected, unplug the network cable and switch off Wi-Fi. Do not shut down the device; IT needs it running for analysis.

## Step 2: Call the IT hotline

Call the IT hotline immediately, day or night. Do not only send an email, because your mailbox might be compromised.

## Step 3: Lost or stolen devices

Report a lost laptop or phone within one hour. IT wipes the device remotely. If it was stolen, file a police report and send the reference number to IT.

## Step 4: Change credentials

IT tells you which passwords to change. Change them from a different, clean device and sign out all sessions in the CRM and email.

## Step 5: Customer data involved

If customer data may have leaked, IT informs the data protection coordinator, who decides within 72 hours whether the authority must be notified. Do not contact affected customers yourself.
`,
  },
  {
    slug: "data-retention-schedule",
    language: "en",
    kind: "knowledge",
    title: "Data retention schedule",
    whenToUse: null,
    markdown: `Fixed retention periods for business and personal data. The data protection coordinator owns this schedule and reviews it every year.

## Why we keep data

We keep personal and business data only as long as we need it for the customer relationship or as the law requires. This page lists the fixed periods; individual requests from people are handled under DSGVO-Anfragen bearbeiten.

## Retention periods

Invoices and accounting records: ten years. Commercial letters, including quotes and order confirmations: six years. Job applications of rejected candidates: six months.

## CRM records

Leads without any activity for 24 months are deleted automatically. Contacts at customers are kept while the company is an active customer and anonymised two years after the last order.

## Email

Mailboxes are archived automatically. Emails of former employees are kept for 12 months and then deleted, except those tagged as business-relevant, which move to the archive.

## Backups

Backups are kept for 90 days. Data deleted in the live systems disappears from backups after that time; we do not restore individual records from backups to delete them earlier.
`,
  },
  {
    slug: "samples-test-parts",
    language: "en",
    kind: "knowledge",
    title: "Free samples and test parts",
    whenToUse: null,
    markdown: `Samples help win series business, so we give them deliberately and track them. They are free for the customer but not for us: last year we sent out parts worth more than 40,000 €.

## Who can get samples

Samples are for industrial customers testing a new part for series use, and for partners at silver level and above. They are not for one-off repairs.

## Limits

Up to 250 € per sample request at list price without approval; above that the head of sales approves. At most three sample requests per customer per year.

## Recording samples

Every sample goes out on a zero-price order with the reason sample and is linked to an open deal in the CRM, so we can see which samples turned into business.

## Following up

Ask for test results after four weeks. If the part is approved, create the series quote the same week.

## Samples that are not returned

Samples stay with the customer; we do not collect them. If a customer asks for a second sample of the same item, charge it at the normal price.
`,
  },
  {
    slug: "delivery-delay",
    language: "en",
    kind: "procedure",
    title: "Handle a delivery delay",
    whenToUse:
      "When an order will not arrive on the confirmed date, for example because a supplier is late or goods were damaged in the warehouse.",
    markdown: `Customers forgive delays; they do not forgive surprises. Most delays come from third-party brands with long lead times; our own HALCO range is rarely affected.

## Step 1: Get a reliable new date

Check the purchase order status in the ERP and, if necessary, call purchasing. Never tell the customer a date that purchasing has not confirmed.

## Step 2: Inform the customer before they ask

Call or email the customer at least two working days before the originally confirmed date, with the new date and the reason in one sentence.

## Step 3: Offer alternatives

Suggest an equivalent part from another brand, a partial delivery of what is in stock, or express shipping at our cost once the goods arrive if the delay is our fault.

## Step 4: Update the order and the CRM

Change the confirmed date in the ERP so that the order confirmation is resent automatically, and add a note to the deal.

## Step 5: Penalties in contracts

Some key-account contracts include penalties for late delivery. If the customer mentions a penalty, inform the key account manager the same day.
`,
  },
  {
    slug: "newsletter-marketing-consent",
    language: "en",
    kind: "knowledge",
    title: "Newsletter and marketing consent",
    whenToUse: null,
    markdown: `Rules for marketing emails to customers and prospects.

## Consent

We only send the newsletter to people who have opted in. Existing customers may receive product information by email about similar products without opt-in, as long as every email offers a way to object.

## Double opt-in

Sign-ups from the website and the dealer portal are confirmed by a second email. Addresses that are not confirmed within 7 days are deleted.

## Unsubscribing

Unsubscribe requests by reply email or phone are honoured within two working days. Set the contact's marketing flag in the CRM to no; do not delete the contact.

## Trade fair contacts

Scanning a business card at a trade fair is not consent. Send one follow-up email about the conversation and ask whether the person wants the newsletter.

## Address lists

We never buy or rent email address lists, and we do not import lists that partners send us.

## Who sends newsletters

Marketing writes the newsletter once a month in German, English and French. Sales staff do not send mass emails from their own mailbox or the CRM; for announcements to more than 20 customers, ask marketing to set up a campaign.
`,
  },
  {
    slug: "certificates-compliance",
    language: "en",
    kind: "knowledge",
    title: "Certificates and compliance documents",
    whenToUse: null,
    markdown: `Which documents customers can get from us, what they cost and how long they take. Requests usually come from the customer's quality department or from purchasing during supplier audits. Check which document is actually meant; customers often say certificate when they mean a simple declaration.

## ISO 9001 certificate

Hallberg is certified to ISO 9001. The current certificate is in the document library; send the PDF on request, no approval needed.

## Material test certificates

Inspection certificates 3.1 according to EN 10204 can be ordered for most bearings and standard parts at 35 € per batch. They must be requested with the order; we cannot create them afterwards.

## RoHS and REACH

Declarations for RoHS and REACH are available for our house brand HALCO. For third-party brands, forward the request to the manufacturer through purchasing, which takes about two weeks.

## Certificates of origin

Chamber of commerce certificates of origin cost 40 € per shipment and are needed by some customers outside the EU. Supplier declarations on preferential origin are issued once per year in January.

## Conflict minerals

We do not issue our own conflict minerals reports; we forward the manufacturers' templates.
`,
  },
  {
    slug: "forecast-pipeline-review",
    language: "en",
    kind: "knowledge",
    title: "Monthly forecast and pipeline review",
    whenToUse: null,
    markdown: `How field sales reports expected revenue each month. The forecast drives purchasing and stock planning for the next quarter, so a realistic number is worth more than an optimistic one.

## Forecast categories

Each open deal is in one category: commit (you are sure it will close this month), best case (likely, but something is open), pipeline (possible), or omitted.

## Deadlines

Update your forecast in the CRM by the third working day of each month. The head of sales consolidates the numbers for management by the fifth.

## Pipeline review meeting

Every second Tuesday of the month, each field sales rep presents their top five deals, the deals that slipped, and the help needed. Each person has 15 minutes.

## Rules for commit

Only deals in the negotiation stage or later can be commit. A commit deal that does not close must be explained in the next meeting.

## Stale deals

Deals whose close date is in the past must be updated before the review; the CRM report of overdue deals is sent automatically the day before.
`,
  },
];

function t(slug: string, section: string): WikiBenchmarkTarget {
  return { slug, section };
}

function q(
  id: string,
  language: WikiBenchmarkQueryLanguage,
  category: WikiBenchmarkCategory,
  query: string,
  ...targets: WikiBenchmarkTarget[]
): WikiBenchmarkQuery {
  return { id, language, category, query, targets };
}

const QUERIES: readonly WikiBenchmarkQuery[] = [
  // Lexical: the query shares its key words with the target section.
  q("WL01", "de", "lexical", "Rückgabefrist einwandfreie Ware", t("rueckgaben-gutschriften", "Rückgabefrist")),
  q(
    "WL02",
    "de",
    "lexical",
    "wiedereinlagerungsgebühr wie hoch",
    t("rueckgaben-gutschriften", "Wiedereinlagerungsgebühr"),
  ),
  q(
    "WL03",
    "de",
    "lexical",
    "Gewährleistung Geschäftskunden wie viele Monate",
    t("gewaehrleistung-garantie", "Gesetzliche Gewährleistung"),
  ),
  q(
    "WL04",
    "de",
    "lexical",
    "herstellergarantie HALCO pneumatikzylinder",
    t("gewaehrleistung-garantie", "Herstellergarantie"),
  ),
  q(
    "WL05",
    "de",
    "lexical",
    "mahnsperre setzen rechnung",
    t("rechnungsdifferenzen-klaeren", "Schritt 2: Mahnsperre setzen"),
  ),
  q("WL06", "de", "lexical", "Versandkosten Palette EU", t("versand-deutschland-eu", "Versandkosten")),
  q("WL07", "de", "lexical", "bestellschluss express", t("versand-deutschland-eu", "Bestellschluss")),
  q(
    "WL08",
    "de",
    "lexical",
    "Ausfuhranmeldung ab welchem Warenwert",
    t("versand-drittlaender-zoll", "Ausfuhranmeldung"),
  ),
  q("WL09", "de", "lexical", "EORI-Nummer britischer Kunde", t("versand-drittlaender-zoll", "Vereinigtes Königreich")),
  q("WL10", "de", "lexical", "dubletten im crm markieren", t("crm-datenpflege", "Dubletten vermeiden")),
  q("WL11", "de", "lexical", "lead bewertung punkte freemail", t("lead-qualifizierung", "Lead-Bewertung")),
  q("WL12", "de", "lexical", "Wahrscheinlichkeit Phase Verhandlung", t("verkaufsphasen", "Phase 4: Verhandlung")),
  q("WL13", "de", "lexical", "Account-Plan Key Account wann erstellen", t("key-account-betreuung", "Account-Plan")),
  q("WL14", "de", "lexical", "urlaubssperre inventur", t("urlaub-abwesenheiten", "Urlaubssperren")),
  q("WL15", "de", "lexical", "Rufbereitschaft Pauschale pro Woche", t("rufbereitschaft", "Vergütung")),
  q(
    "WL16",
    "de",
    "lexical",
    "zwei-faktor-anmeldung sms codes erlaubt?",
    t("passwort-sicherheitsrichtlinie", "Zwei-Faktor-Anmeldung"),
  ),
  q("WL17", "de", "lexical", "DSGVO Auskunft Frist ein Monat", t("dsgvo-anfragen", "Schritt 3: Frist beachten")),
  q("WL18", "de", "lexical", "projektschutz partner 90 tage", t("partnerprogramm", "Projektschutz")),
  q("WL19", "de", "lexical", "skonto auf fracht", t("zahlungsbedingungen-mahnwesen", "Skonto")),
  q("WL20", "de", "lexical", "Mahnstufen Gebühr zweite Mahnung", t("zahlungsbedingungen-mahnwesen", "Mahnstufen")),
  q("WL21", "de", "lexical", "gültigkeit angebot metallzuschlag", t("angebot-erstellen", "Schritt 3: Gültigkeit")),
  q(
    "WL22",
    "de",
    "lexical",
    "bonitätsprüfung neukunde kreditversicherung",
    t("neukunden-anlegen", "Schritt 2: Bonitätsprüfung"),
  ),
  q(
    "WL23",
    "de",
    "lexical",
    "Hotel pro Nacht München Reisekosten",
    t("dienstreisen-reisekosten", "Hotel und Verpflegung"),
  ),
  q(
    "WL24",
    "de",
    "lexical",
    "visitenkarten scanner-app messe",
    t("messen-veranstaltungen", "Kontakte vom Stand erfassen"),
  ),
  q(
    "WL25",
    "en",
    "lexical",
    "return label EU customers shipping costs",
    t("returns-outside-germany", "Return shipping costs"),
  ),
  q("WL26", "en", "lexical", "distributor volume tiers", t("pricing-eu-distributors", "Volume tiers")),
  q("WL27", "en", "lexical", "price increase notice for distributors", t("pricing-eu-distributors", "Price increases")),
  q(
    "WL28",
    "en",
    "lexical",
    "special price approval chain who approves",
    t("special-price-request", "Step 3: Approval chain"),
  ),
  q(
    "WL29",
    "en",
    "lexical",
    "welcome discount customers switching from competitor",
    t("competitors-objections", "Customers switching from a competitor"),
  ),
  q("WL30", "en", "lexical", "shared mailboxes returns@ access", t("tool-access", "Shared mailboxes")),
  q("WL31", "en", "lexical", "contractor accounts expire", t("tool-access", "Access for contractors")),
  q("WL32", "en", "lexical", "P1 response target minutes", t("support-service-levels", "Response targets")),
  q(
    "WL33",
    "en",
    "lexical",
    "report lost laptop within one hour",
    t("report-security-incident", "Step 3: Lost or stolen devices"),
  ),
  q(
    "WL34",
    "en",
    "lexical",
    "retention period for invoices",
    t("data-retention-schedule", "Retention periods"),
    t("dsgvo-anfragen", "Schritt 4: Daten zusammenstellen oder löschen"),
  ),
  q("WL35", "en", "lexical", "sample request limit without approval", t("samples-test-parts", "Limits")),
  q(
    "WL36",
    "en",
    "lexical",
    "delivery delay inform the customer",
    t("delivery-delay", "Step 2: Inform the customer before they ask"),
  ),
  q("WL37", "en", "lexical", "newsletter double opt-in", t("newsletter-marketing-consent", "Double opt-in")),
  q(
    "WL38",
    "en",
    "lexical",
    "material test certificate 3.1 price per batch",
    t("certificates-compliance", "Material test certificates"),
  ),
  q("WL39", "en", "lexical", "forecast rules for commit deals", t("forecast-pipeline-review", "Rules for commit")),
  q(
    "WL40",
    "en",
    "lexical",
    "german language course for international reps",
    t("onboarding-international-reps", "German language course"),
  ),

  // Paraphrase: no content word is shared with the page title or the target section.
  q(
    "WP01",
    "de",
    "paraphrase",
    "wie lange hat man zeit, fehlbestellungen zurückzuschicken",
    t("rueckgaben-gutschriften", "Rückgabefrist"),
  ),
  q(
    "WP02",
    "de",
    "paraphrase",
    "zieht ihr was ab wenn ich ungenutzte teile zurücksende",
    t("rueckgaben-gutschriften", "Wiedereinlagerungsgebühr"),
  ),
  q(
    "WP03",
    "de",
    "paraphrase",
    "kann man konfektionierte zahnriemen wieder zurückgeben",
    t("rueckgaben-gutschriften", "Ausgeschlossene Artikel"),
  ),
  q(
    "WP04",
    "de",
    "paraphrase",
    "lager ist kaputt weil nie gefettet wurde – zahlen wir das?",
    t("gewaehrleistung-garantie", "Ausschlüsse"),
  ),
  q(
    "WP05",
    "de",
    "paraphrase",
    "kunde will geld für produktionsausfall wegen defektem teil",
    t("gewaehrleistung-garantie", "Folgekosten"),
  ),
  q(
    "WP06",
    "de",
    "paraphrase",
    "wer beurteilt ob ein kaputtes lager wirklich fehlerhaft ist",
    t("reklamation-bearbeiten", "Schritt 3: Prüfung durch die Qualitätssicherung"),
  ),
  q(
    "WP07",
    "de",
    "paraphrase",
    "falscher betrag abgerechnet – stellen wir komplett neu aus?",
    t("rechnungsdifferenzen-klaeren", "Schritt 4: Korrekturrechnung oder Ablehnung"),
  ),
  q(
    "WP08",
    "de",
    "paraphrase",
    "ab welchem bestellwert ist porto gratis",
    t("versand-deutschland-eu", "Versandkosten"),
  ),
  q(
    "WP09",
    "de",
    "paraphrase",
    "wie viele tage bis eine sendung in spanien ankommt",
    t("versand-deutschland-eu", "Lieferzeiten EU"),
  ),
  q(
    "WP10",
    "de",
    "paraphrase",
    "warum hat der österreichische kunde mehrwertsteuer auf der rechnung",
    t("versand-deutschland-eu", "Innergemeinschaftliche Lieferung"),
  ),
  q(
    "WP11",
    "de",
    "paraphrase",
    "kanadischer abnehmer möchte frei haus inklusive verzollung beim empfänger",
    t("versand-drittlaender-zoll", "Incoterms"),
  ),
  q(
    "WP12",
    "de",
    "paraphrase",
    "kontakt ist in rente gegangen, entfernen oder was?",
    t("crm-datenpflege", "Ansprechpartner pflegen"),
  ),
  q(
    "WP13",
    "de",
    "paraphrase",
    "bis wann muss ich ein telefonat mit dem kunden eintragen",
    t("crm-datenpflege", "Aktivitäten dokumentieren"),
    t("operating-guide", "Recording work"),
  ),
  q(
    "WP14",
    "de",
    "paraphrase",
    "woran erkenne ich ob ein interessent es ernst meint",
    t("lead-qualifizierung", "Qualifizierungskriterien"),
  ),
  q(
    "WP15",
    "de",
    "paraphrase",
    "privatmann will zwei kugellager kaufen, was mache ich damit im system",
    t("lead-qualifizierung", "Disqualifizieren"),
  ),
  q(
    "WP16",
    "de",
    "paraphrase",
    "meine chance wurde vom system einfach geschlossen, wieso",
    t("verkaufsphasen", "Gewonnen oder verloren"),
  ),
  q(
    "WP17",
    "de",
    "paraphrase",
    "ab welchem umsatz gilt ein kunde als großkunde",
    t("key-account-betreuung", "Wer ist ein Key Account"),
  ),
  q(
    "WP18",
    "de",
    "paraphrase",
    "wie fix muss der chef reagieren, nachdem ich den fall nach oben gegeben hab",
    t("kundeneskalation", "Reaktionszeiten"),
  ),
  q(
    "WP19",
    "de",
    "paraphrase",
    "wer übernimmt meinen kram während ich eine woche frei habe",
    t("urlaub-abwesenheiten", "Vertretungsregel"),
  ),
  q(
    "WP20",
    "de",
    "paraphrase",
    "bis wie viel uhr abends ist jemand für eilige ersatzteile erreichbar",
    t("rufbereitschaft", "Zeiten und Besetzung"),
  ),
  q(
    "WP21",
    "de",
    "paraphrase",
    "kann ich meiner kollegin einfach die logindaten für den lieferanten-shop weitergeben",
    t("passwort-sicherheitsrichtlinie", "Passwortmanager"),
  ),
  q(
    "WP22",
    "de",
    "paraphrase",
    "soll ich mir den perso zeigen lassen bevor ich jemandem seine gespeicherten infos gebe",
    t("dsgvo-anfragen", "Schritt 2: Identität prüfen"),
  ),
  q(
    "WP23",
    "de",
    "paraphrase",
    "neuer großer auftrag bleibt hängen, obwohl die firma immer pünktlich zahlt",
    t("zahlungsbedingungen-mahnwesen", "Kreditlimit"),
  ),
  q(
    "WP24",
    "de",
    "paraphrase",
    "muss jemand gegenzeichnen wenn das offert sechsstellig ist",
    t("angebot-erstellen", "Schritt 4: Freigabe"),
  ),
  q(
    "WP25",
    "de",
    "paraphrase",
    "wie lange bis der frisch eröffnete account eine debitorennummer bekommt",
    t("neukunden-anlegen", "Schritt 4: Stammdaten erfassen"),
  ),
  q(
    "WP26",
    "en",
    "paraphrase",
    "swiss client sending parts to us again, what paperwork avoids tariffs on our side",
    t("returns-outside-germany", "Customs on returns from non-EU countries"),
  ),
  q(
    "WP27",
    "en",
    "paraphrase",
    "polish firm wants its money back paid out in zloty",
    t("returns-outside-germany", "Refund currency and bank fees"),
  ),
  q(
    "WP28",
    "en",
    "paraphrase",
    "french reseller, which rate sheet do i quote from",
    t("pricing-eu-distributors", "Country price lists"),
  ),
  q(
    "WP29",
    "en",
    "paraphrase",
    "italian dealer wants to be the only one selling our stuff in lombardy",
    t("pricing-eu-distributors", "Exclusivity"),
  ),
  q(
    "WP30",
    "en",
    "paraphrase",
    "buyer just keeps nagging for a cheaper deal, can i ask management to drop it",
    t("special-price-request", "Step 1: Check whether a special price is justified"),
  ),
  q(
    "WP31",
    "en",
    "paraphrase",
    "buyer claims the webshop down the road beats us, how do i argue",
    t("competitors-objections", "When the customer says we are too expensive"),
  ),
  q(
    "WP32",
    "en",
    "paraphrase",
    "can i mention that rival is close to bankruptcy",
    t("competitors-objections", "What we never say"),
  ),
  q(
    "WP33",
    "en",
    "paraphrase",
    "colleague quits friday, when is her login switched off",
    t("tool-access", "Leaving the company or changing teams"),
  ),
  q(
    "WP34",
    "en",
    "paraphrase",
    "new hire can't get into the crm yet, who sorts that out",
    t("tool-access", "Requesting access"),
    t("onboarding-neue-mitarbeitende", "Arbeitsplatz und Ausstattung"),
  ),
  q(
    "WP35",
    "en",
    "paraphrase",
    "how urgent is a ticket when the plant stopped because our bearing failed",
    t("support-service-levels", "Priority levels"),
  ),
  q(
    "WP36",
    "en",
    "paraphrase",
    "buyer texted me an order on my private mobile, is that ok",
    t("support-service-levels", "Channels"),
  ),
  q(
    "WP37",
    "en",
    "paraphrase",
    "clicked a weird attachment, should i power off my computer",
    t("report-security-incident", "Step 1: Disconnect"),
  ),
  q(
    "WP38",
    "en",
    "paraphrase",
    "how long do we hold on to the inbox of someone who left",
    t("data-retention-schedule", "Email"),
  ),
  q(
    "WP39",
    "en",
    "paraphrase",
    "once a contact is erased, does it linger in the nightly copies",
    t("data-retention-schedule", "Backups"),
  ),
  q(
    "WP40",
    "en",
    "paraphrase",
    "can a bronze reseller have a trial piece for nothing",
    t("samples-test-parts", "Who can get samples"),
  ),
  q(
    "WP41",
    "en",
    "paraphrase",
    "supplier is late, what can i propose so the client isnt stuck waiting",
    t("delivery-delay", "Step 3: Offer alternatives"),
  ),
  q(
    "WP42",
    "en",
    "paraphrase",
    "guy called and said stop sending him promos",
    t("newsletter-marketing-consent", "Unsubscribing"),
  ),
  q(
    "WP43",
    "en",
    "paraphrase",
    "met someone at hannover expo, may i add him to our mailing",
    t("newsletter-marketing-consent", "Trade fair contacts"),
  ),
  q(
    "WP44",
    "en",
    "paraphrase",
    "egyptian importer needs proof the goods were made in europe, price?",
    t("certificates-compliance", "Certificates of origin"),
  ),
  q(
    "WP45",
    "en",
    "paraphrase",
    "what am i supposed to prepare for the recurring call where everyone walks through their top opportunities",
    t("forecast-pipeline-review", "Pipeline review meeting"),
  ),

  // Cross-language: the query language differs from the language of the primary target page.
  q(
    "WX01",
    "es",
    "cross-language",
    "cuánto tiempo tiene un cliente para devolver material que no necesita",
    t("rueckgaben-gutschriften", "Rückgabefrist"),
  ),
  q(
    "WX02",
    "es",
    "cross-language",
    "tenemos que pagar la aduana si mandamos a suiza?",
    t("versand-drittlaender-zoll", "Schweiz und Norwegen"),
    t("versand-drittlaender-zoll", "Incoterms"),
  ),
  q(
    "WX03",
    "es",
    "cross-language",
    "descuento máximo que puedo dar yo solo a un distribuidor alemán",
    t("rabatte-fachhandel", "Freigabegrenzen im Innendienst"),
  ),
  q(
    "WX04",
    "es",
    "cross-language",
    "garantía cilindros neumáticos cuántos meses",
    t("gewaehrleistung-garantie", "Herstellergarantie"),
  ),
  q(
    "WX05",
    "es",
    "cross-language",
    "cliente dice que la factura tiene un precio mal, qué hago primero",
    t("rechnungsdifferenzen-klaeren", "Schritt 1: Einordnen"),
    t("rechnungsdifferenzen-klaeren", "Schritt 2: Mahnsperre setzen"),
  ),
  q(
    "WX06",
    "es",
    "cross-language",
    "plazo de pago estándar para clientes nuevos",
    t("zahlungsbedingungen-mahnwesen", "Zahlungsziele"),
  ),
  q("WX07", "es", "cross-language", "horario de guardia el sábado", t("rufbereitschaft", "Zeiten und Besetzung")),
  q(
    "WX08",
    "es",
    "cross-language",
    "cómo evito crear una empresa duplicada en el crm",
    t("crm-datenpflege", "Dubletten vermeiden"),
    t("neukunden-anlegen", "Schritt 1: Dublettenprüfung"),
  ),
  q(
    "WX09",
    "es",
    "cross-language",
    "requisitos para entrar al programa de partners",
    t("partnerprogramm", "Aufnahmevoraussetzungen"),
  ),
  q(
    "WX10",
    "es",
    "cross-language",
    "límite de hotel por noche en viaje de trabajo",
    t("dienstreisen-reisekosten", "Hotel und Verpflegung"),
  ),
  q(
    "WX11",
    "fr",
    "cross-language",
    "combien de temps pour répondre à une demande RGPD",
    t("dsgvo-anfragen", "Schritt 3: Frist beachten"),
  ),
  q(
    "WX12",
    "fr",
    "cross-language",
    "commande passée avant 15h, elle part le jour même ?",
    t("versand-deutschland-eu", "Bestellschluss"),
  ),
  q(
    "WX13",
    "fr",
    "cross-language",
    "à partir de quel montant un prix projet pour un client industriel",
    t("rabatte-industriekunden", "Projektpreise"),
  ),
  q(
    "WX14",
    "fr",
    "cross-language",
    "frais pour petite commande sous 150 euros",
    t("rabatte-industriekunden", "Mindermengenzuschlag"),
  ),
  q(
    "WX15",
    "fr",
    "cross-language",
    "probabilité du deal quand l'offre est envoyée",
    t("verkaufsphasen", "Phase 3: Angebot versendet"),
  ),
  q(
    "WX16",
    "fr",
    "cross-language",
    "qui prévenir quand un client menace de partir chez un concurrent",
    t("kundeneskalation", "Eskalationsstufen"),
    t("kundeneskalation", "Schritt 2: Eskalation melden"),
  ),
  q(
    "WX17",
    "fr",
    "cross-language",
    "livraison au Royaume-Uni numéro EORI",
    t("versand-drittlaender-zoll", "Vereinigtes Königreich"),
  ),
  q(
    "WX18",
    "fr",
    "cross-language",
    "longueur minimum du mot de passe",
    t("passwort-sicherheitsrichtlinie", "Anforderungen an Passwörter"),
  ),
  q(
    "WX19",
    "fr",
    "cross-language",
    "cartes de visite du salon, en combien de jours saisir les notes",
    t("messen-veranstaltungen", "Kontakte vom Stand erfassen"),
  ),
  q(
    "WX20",
    "fr",
    "cross-language",
    "gamme pneumatique de la marque maison",
    t("produktlinien", "Pneumatik"),
    t("produktlinien", "Hausmarke HALCO"),
  ),
  q(
    "WX21",
    "it",
    "cross-language",
    "quanti giorni di ferie ho all'anno",
    t("urlaub-abwesenheiten", "Urlaubsanspruch und Antrag"),
  ),
  q(
    "WX22",
    "it",
    "cross-language",
    "bonus annuale per rivenditori oltre 150 mila",
    t("rabatte-fachhandel", "Jahresbonus"),
  ),
  q(
    "WX23",
    "it",
    "cross-language",
    "cliente key account vuole pagare a 90 giorni",
    t("key-account-betreuung", "Sonderkonditionen"),
    t("zahlungsbedingungen-mahnwesen", "Zahlungsziele"),
  ),
  q(
    "WX24",
    "it",
    "cross-language",
    "come verifico la partita IVA di un nuovo cliente in Austria",
    t("neukunden-anlegen", "Schritt 3: Umsatzsteuer-ID prüfen"),
  ),
  q(
    "WX25",
    "it",
    "cross-language",
    "ordine bloccato per dual use esportazione",
    t("versand-drittlaender-zoll", "Exportkontrolle"),
  ),
  q(
    "WX26",
    "it",
    "cross-language",
    "corsi obbligatori nel primo mese",
    t("onboarding-neue-mitarbeitende", "Pflichtschulungen"),
  ),
  q(
    "WX27",
    "it",
    "cross-language",
    "quando arriva la nota di credito dopo il reso",
    t("rueckgaben-gutschriften", "Gutschrift und Erstattung"),
  ),
  q(
    "WX28",
    "it",
    "cross-language",
    "autenticazione a due fattori obbligatoria?",
    t("passwort-sicherheitsrichtlinie", "Zwei-Faktor-Anmeldung"),
  ),
  q("WX29", "it", "cross-language", "punteggio lead, quando diventa caldo", t("lead-qualifizierung", "Lead-Bewertung")),
  q(
    "WX30",
    "it",
    "cross-language",
    "valore massimo dei regali ai clienti",
    t("messen-veranstaltungen", "Geschenke und Einladungen"),
  ),
  q(
    "WX31",
    "en",
    "cross-language",
    "how long is the warranty for business customers",
    t("gewaehrleistung-garantie", "Gesetzliche Gewährleistung"),
  ),
  q("WX32", "en", "cross-language", "dunning levels and fees", t("zahlungsbedingungen-mahnwesen", "Mahnstufen")),
  q("WX33", "en", "cross-language", "on-call allowance per week", t("rufbereitschaft", "Vergütung")),
  q("WX34", "en", "cross-language", "how many days is a quote valid", t("angebot-erstellen", "Schritt 3: Gültigkeit")),
  q(
    "WX35",
    "en",
    "cross-language",
    "mileage rate private car business trip",
    t("dienstreisen-reisekosten", "Fahrten mit dem Auto"),
  ),
  q(
    "WX36",
    "de",
    "cross-language",
    "wie schnell müssen wir bei P1 antworten",
    t("support-service-levels", "Response targets"),
  ),
  q(
    "WX37",
    "de",
    "cross-language",
    "Diensthandy gestohlen, was jetzt",
    t("report-security-incident", "Step 3: Lost or stolen devices"),
  ),
  q(
    "WX38",
    "de",
    "cross-language",
    "wie lange bewahren wir Bewerbungen abgelehnter Kandidaten auf",
    t("data-retention-schedule", "Retention periods"),
  ),
  q("WX39", "de", "cross-language", "Muster kostenlos bis zu welchem Wert", t("samples-test-parts", "Limits")),
  q(
    "WX40",
    "de",
    "cross-language",
    "Preiserhöhung Händler im Ausland wie lange vorher ankündigen",
    t("pricing-eu-distributors", "Price increases"),
  ),

  // Typo: realistic misspellings; each query holds at least one token that appears nowhere in the corpus.
  q("WT01", "de", "typo", "rückgabefirst ware", t("rueckgaben-gutschriften", "Rückgabefrist")),
  q("WT02", "de", "typo", "gewärleistung wie lange", t("gewaehrleistung-garantie", "Gesetzliche Gewährleistung")),
  q("WT03", "de", "typo", "versandkostn eu palete", t("versand-deutschland-eu", "Versandkosten")),
  q("WT04", "de", "typo", "ausfuhranmledung warenwert", t("versand-drittlaender-zoll", "Ausfuhranmeldung")),
  q("WT05", "de", "typo", "dubleten crm zusammenführen", t("crm-datenpflege", "Dubletten vermeiden")),
  q("WT06", "de", "typo", "rufbereitshaft samstag uhrzeit", t("rufbereitschaft", "Zeiten und Besetzung")),
  q("WT07", "de", "typo", "passwortmanger geteilte zugänge", t("passwort-sicherheitsrichtlinie", "Passwortmanager")),
  q(
    "WT08",
    "de",
    "typo",
    "dsgvo löschung rechungen",
    t("dsgvo-anfragen", "Schritt 4: Daten zusammenstellen oder löschen"),
    t("data-retention-schedule", "Retention periods"),
  ),
  q("WT09", "de", "typo", "skonot 10 tage", t("zahlungsbedingungen-mahnwesen", "Skonto")),
  q("WT10", "de", "typo", "partnerprogram gold vorteile leistungen", t("partnerprogramm", "Leistungen für Partner")),
  q("WT11", "en", "typo", "retrun label eu custmer", t("returns-outside-germany", "Return shipping costs")),
  q("WT12", "en", "typo", "distributer volum tiers", t("pricing-eu-distributors", "Volume tiers")),
  q(
    "WT13",
    "en",
    "typo",
    "securty incident lost phnoe",
    t("report-security-incident", "Step 3: Lost or stolen devices"),
  ),
  q("WT14", "en", "typo", "doubel opt in newsleter", t("newsletter-marketing-consent", "Double opt-in")),
  q("WT15", "en", "typo", "certifcate of orgin cost", t("certificates-compliance", "Certificates of origin")),

  // Multi-hop or ambiguous: several pages look relevant, one section is clearly the best answer.
  q(
    "WM01",
    "de",
    "multi-hop",
    "Kunde aus Zürich will ein defektes Lager zurückschicken – welche Papiere braucht er, damit wir keinen Einfuhrzoll zahlen?",
    t("returns-outside-germany", "Customs on returns from non-EU countries"),
  ),
  q(
    "WM02",
    "de",
    "multi-hop",
    "händler will 8 prozentpunkte extra wegen konkurrenzangebot, wer muss das absegnen",
    t("rabatte-fachhandel", "Freigabegrenzen im Innendienst"),
  ),
  q(
    "WM03",
    "de",
    "multi-hop",
    "Lieferung an Key Account kommt zu spät und im Vertrag steht eine Vertragsstrafe, wen informiere ich",
    t("delivery-delay", "Step 5: Penalties in contracts"),
  ),
  q(
    "WM04",
    "en",
    "multi-hop",
    "rep's stolen laptop had customer contacts on it, do we have to notify the regulator",
    t("report-security-incident", "Step 5: Customer data involved"),
  ),
  q(
    "WM05",
    "en",
    "multi-hop",
    "brand-new french distributor with no purchase history, what extra discount do they get",
    t("pricing-eu-distributors", "Volume tiers"),
  ),
  q(
    "WM06",
    "es",
    "multi-hop",
    "cliente industrial pide una muestra gratis de 400 euros, quién la aprueba",
    t("samples-test-parts", "Limits"),
  ),
  q(
    "WM07",
    "de",
    "multi-hop",
    "rechnung falsch weil rahmenvertragsrabatt fehlt, erste mahnung ist schon raus – wie stoppe ich die nächste",
    t("rechnungsdifferenzen-klaeren", "Schritt 2: Mahnsperre setzen"),
  ),
  q(
    "WM08",
    "it",
    "multi-hop",
    "il cliente vuole restituire cinghie tagliate su misura ordinate per errore",
    t("rueckgaben-gutschriften", "Ausgeschlossene Artikel"),
  ),
  q(
    "WM09",
    "de",
    "multi-hop",
    "darf ich einem Kunden, der gerade vom Wettbewerb kommt, auf die erste Bestellung was extra geben?",
    t("competitors-objections", "Customers switching from a competitor"),
  ),
  q(
    "WM10",
    "en",
    "multi-hop",
    "machine down at a customer with maintenance contract on saturday at 7 pm, can anyone ship parts",
    t("rufbereitschaft", "Zeiten und Besetzung"),
  ),

  // No match: nothing in the Wiki answers these.
  q("WN01", "de", "no-match", "Tankkarte für den Firmenwagen verloren"),
  q("WN02", "de", "no-match", "Zuschuss zur betrieblichen Altersvorsorge"),
  q("WN03", "en", "no-match", "how many weeks of parental leave do we get"),
  q("WN04", "en", "no-match", "how do i book a meeting room"),
  q("WN05", "es", "no-match", "cuál es el horario del comedor"),
  q("WN06", "es", "no-match", "cómo pido un aumento de sueldo"),
  q("WN07", "fr", "no-match", "remboursement des frais de garde d'enfants"),
  q("WN08", "fr", "no-match", "où trouver le logo en haute résolution"),
  q("WN09", "it", "no-match", "come si prenota il parcheggio aziendale"),
  q("WN10", "it", "no-match", "quando viene pagata la tredicesima"),
];

/** Splits a benchmark page's Markdown into its `##` sections; text before the first heading is not a section. */
export function wikiBenchmarkSections(markdown: string): WikiBenchmarkSection[] {
  const sections: WikiBenchmarkSection[] = [];
  let current: WikiBenchmarkSection | null = null;
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      current = { heading: heading[1], text: "" };
      sections.push(current);
    } else if (current) current.text += `${line}\n`;
  }
  return sections.map((section) => ({ heading: section.heading, text: section.text.trim() }));
}

export function loadWikiRetrievalBenchmark(): WikiRetrievalBenchmark {
  return { pages: PAGES, queries: QUERIES };
}
