import type { SeedContext } from "../context";

import { SYNTHETIC_SERVICE_DEAL_LINKS } from "../deals";
import { fixtureId } from "../helpers";

// Sales-Sandbox demo profile for "Reifenvertrieb Seng GmbH" (B2B tyre wholesaler).
// Applied in-place AFTER the synthetic seed, and ONLY when the resolved profile is
// "rv-seng" (branch sandbox/rv-seng, or DEMO_PROFILE=rv-seng locally). It relabels the
// existing fixtures at their deterministic ids — same cardinality (19 orgs, 43 services,
// 10 deals) — so every shared link table (contact/deal/service/relationships/custom
// fields/widgets) stays valid and the tested default seed path is untouched.
//
// All data is fictional; there are no real Reifenvertrieb Seng customer or personal
// records here. Downstream fixtures key by index/id, never by these labels.

export const RV_SENG_PROFILE_KEY = "rv-seng";

export function resolveProfileKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.DEMO_PROFILE?.trim();
  if (explicit) return explicit;
  const ref = env.VERCEL_GIT_COMMIT_REF?.trim();
  if (ref?.startsWith("sandbox/")) return ref.slice("sandbox/".length);
  return undefined;
}

// 19 organizations = Seng's B2B customers (workshops, dealerships, fleets, online shops).
export const RV_SENG_ORGANIZATION_NAMES: readonly string[] = [
  "Autohaus Rheingold GmbH",
  "KFZ-Meister Wagner",
  "ReifenProfi Frankfurt",
  "Pneu Zentrale Hessen",
  "CarService Plus (Werkstattkette)",
  "Flotte24 Fuhrpark GmbH",
  "TyreOutlet24 Onlineshop",
  "Nutzfahrzeug-Service Süd",
  "Reifen Weber e.K.",
  "Autopark Leasing GmbH",
  "Werkstatt am Ring",
  "Reifenhandel Alpin (AT)",
  "Garage Nordlicht",
  "Autohaus Sonnenberg",
  "Pneus Express (FR)",
  "Van & Truck Center",
  "Reifen Discount City",
  "Mobil Werkstatt Butzbach",
  "E-Tyre Handel GmbH",
];

// 43 services = Seng's catalogue (tyres by class/season/size, wheels, accessories,
// logistics, B2B terms). amount = EUR net indicative unit price.
export const RV_SENG_SERVICE_DEFINITIONS: readonly (readonly [name: string, amount: number])[] = [
  ["PKW-Sommerreifen Budget 195/65 R15", 45],
  ["PKW-Sommerreifen Premium 205/55 R16", 95],
  ["PKW-Winterreifen Budget 195/65 R15", 52],
  ["PKW-Winterreifen Premium 225/45 R17", 125],
  ["PKW-Ganzjahresreifen 205/55 R16", 88],
  ["SUV-Sommerreifen 235/55 R18", 140],
  ["SUV-Winterreifen 235/60 R18", 155],
  ["SUV-Ganzjahresreifen 235/55 R19", 165],
  ["Runflat-Reifen 245/40 R18", 175],
  ["Hochleistungsreifen UHP 245/35 R19", 190],
  ["LKW-Reifen Lenkachse 315/80 R22.5", 380],
  ["LKW-Reifen Antriebsachse 315/70 R22.5", 395],
  ["LKW-Reifen Trailer 385/65 R22.5", 360],
  ["Transporter-Reifen LLKW 235/65 R16C", 120],
  ["Winterkomplettrad Stahl 16 Zoll", 145],
  ["Sommerkomplettrad Alu 17 Zoll", 210],
  ["Alufelge 17 Zoll", 110],
  ["Alufelge 19 Zoll", 165],
  ["Stahlfelge 16 Zoll", 45],
  ["RDKS-Sensor (TPMS)", 32],
  ["Ventil-Set", 6],
  ["Radschrauben-Satz", 18],
  ["Reifenmontage & Wuchten (Satz)", 40],
  ["Achsvermessung", 79],
  ["Saisonale Einlagerung (Satz)", 30],
  ["Express-Versand DE (Palette)", 24],
  ["Standard-Versand DE (Satz)", 9],
  ["Auslandsversand EU (Palette)", 65],
  ["Altreifenentsorgung (Satz)", 12],
  ["Reifenreparatur / Pannenset", 15],
  ["Notlaufsystem-Kit", 210],
  ["Schneeketten-Set", 55],
  ["Dropshipping-Anbindung (Setup)", 250],
  ["B2B-Portal Onboarding", 500],
  ["Jahresrahmenvertrag Rabattstaffel", 0],
  ["Streckengeschäft-Abwicklung", 20],
  ["Reifenlabel-Beratung", 0],
  ["Großgebinde PKW-Reifen (Palette 40 Stk)", 3200],
  ["Großgebinde SUV-Reifen (Palette 24 Stk)", 3600],
  ["Kleinteile & Zubehör-Set", 35],
  ["Marken-Listung Premium (Jahr)", 1500],
  ["Retouren-Handling (Satz)", 8],
  ["Werkstatt-Starterpaket", 950],
];

// 10 deals = typical wholesale engagements. Order stays bound to the shared default
// link tables (deal/org, service/deal, status) — do not reorder.
export const RV_SENG_DEAL_NAMES: readonly string[] = [
  "Wintersaison-Bevorratung 2026",
  "Jahresrahmenvertrag PKW-Reifen",
  "Flottenausstattung 120 Fahrzeuge",
  "LKW-Reifen Rahmenvertrag",
  "Sommerreifen-Erstausstattung Werkstatt",
  "Dropshipping-Anbindung Onlineshop",
  "SUV-Ganzjahres Aktion Q1",
  "Budget-Segment Ersatzbedarf",
  "Premium-Marken Listung",
  "Runflat & RDKS Komplettpaket",
];

export async function applyRvSengOverrides(context: SeedContext): Promise<void> {
  const { prisma } = context;

  for (let index = 0; index < RV_SENG_ORGANIZATION_NAMES.length; index += 1) {
    await prisma.organization.update({
      where: { id: fixtureId("70000000", index + 1) },
      data: { name: RV_SENG_ORGANIZATION_NAMES[index] },
    });
  }

  for (let index = 0; index < RV_SENG_SERVICE_DEFINITIONS.length; index += 1) {
    const [name, amount] = RV_SENG_SERVICE_DEFINITIONS[index];
    await prisma.service.update({
      where: { id: fixtureId("90000000", index + 1) },
      data: { name, amount },
    });
  }

  for (let index = 0; index < RV_SENG_DEAL_NAMES.length; index += 1) {
    const links = SYNTHETIC_SERVICE_DEAL_LINKS.filter(([dealIndex]) => dealIndex === index);
    const totalValue = links.reduce(
      (sum, [, serviceIndex, quantity]) => sum + RV_SENG_SERVICE_DEFINITIONS[serviceIndex][1] * quantity,
      0,
    );
    const totalQuantity = links.reduce((sum, [, , quantity]) => sum + quantity, 0);
    await prisma.deal.update({
      where: { id: fixtureId("80000000", index + 1) },
      data: { name: RV_SENG_DEAL_NAMES[index], totalValue, totalQuantity },
    });
  }
}
