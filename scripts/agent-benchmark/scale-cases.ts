import type { ObservedToolLike, SeedHelpers } from "./complex-cases";

import { mailThread } from "./complex-cases";

export const SCALE_CASE_IDS = ["B1", "B2", "B3", "B4", "B5", "A1", "A2", "A3", "A4"] as const;
export type ScaleCaseId = (typeof SCALE_CASE_IDS)[number];

export type ScaleCase = {
  id: ScaleCaseId;
  title: string;
  actor: "driver";
  prompts: readonly string[];
  judgeFacts: readonly string[];
};

export function isScaleCaseId(value: string): value is ScaleCaseId {
  return (SCALE_CASE_IDS as readonly string[]).includes(value);
}

type Status = "Open" | "Won" | "Lost";
type PlannedDeal = { key: string; name: string; value: number; status: Status; owner: string };

const pad = (value: number, width = 3) => String(value).padStart(width, "0");
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export const EXTRA_OWNERS = [
  ["nina", "Nina", "Weiss"],
  ["omar", "Omar", "Haddad"],
  ["paula", "Paula", "Ruiz"],
  ["quinn", "Quinn", "Baker"],
] as const;
const OWNER_NAMES: Record<string, string> = {
  sofia: "Sofia Rossi",
  max: "Max Klein",
  ...Object.fromEntries(EXTRA_OWNERS.map(([key, first, last]) => [key, `${first} ${last}`])),
};

export function orbitDeals(): PlannedDeal[] {
  return Array.from({ length: 320 }, (_, index) => {
    const i = index + 1;
    const status: Status = i % 7 === 0 ? "Lost" : i % 3 === 0 ? "Won" : "Open";
    return { key: `orbit-${i}`, name: `Orbit-${pad(i)}`, value: 100 * (((i * 37) % 97) + 3), status, owner: "sofia" };
  });
}

const SUMMIT_OWNERS = ["sofia", "max", "nina", "omar"] as const;
export function summitDeals(): PlannedDeal[] {
  return Array.from({ length: 300 }, (_, index) => {
    const i = index + 1;
    return {
      key: `summit-${i}`,
      name: `Summit-${pad(i)}`,
      value: 100 * (((i * 53) % 89) + 10),
      status: i % 4 === 0 ? "Won" : "Open",
      owner: SUMMIT_OWNERS[(i * 7 + Math.floor(i / 4)) % 4],
    };
  });
}

const COMET_MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09"] as const;
export function cometDeals(): (PlannedDeal & { closeDate: string })[] {
  return Array.from({ length: 300 }, (_, index) => {
    const i = index + 1;
    const month = COMET_MONTHS[(i * 5) % 4];
    const day = String((i % 25) + 2).padStart(2, "0");
    return {
      key: `comet-${i}`,
      name: `Comet-${pad(i)}`,
      value: 100 * (((i * 29) % 71) + 8),
      status: i % 3 === 0 ? "Open" : "Won",
      owner: "sofia",
      closeDate: `${month}-${day}T12:00:00.000Z`,
    };
  });
}

const WAITING_THREADS = [7, 19, 33, 46, 58, 71, 89, 104, 126, 150, 177, 203] as const;
export function inboxThreads() {
  return Array.from({ length: 212 }, (_, index) => {
    const i = index + 1;
    return { key: `inbox-${i}`, subject: `Request ${pad(i)}: ${["pricing", "invoice", "onboarding", "renewal"][i % 4]} question`, waiting: (WAITING_THREADS as readonly number[]).includes(i) };
  });
}

export function atlasDeals(): PlannedDeal[] {
  const open = Array.from({ length: 511 }, (_, index) => {
    const i = index + 1;
    return { key: `atlas-${i}`, name: `Atlas-${pad(i)}`, value: 100 * (((i * 7919) % 997) + 11), status: "Open" as Status, owner: "sofia" };
  });
  const closed = Array.from({ length: 100 }, (_, index) => {
    const i = index + 512;
    return { key: `atlas-${i}`, name: `Atlas-${pad(i)}`, value: 100 * (((i * 104_729) % 991) + 900), status: (i % 2 ? "Won" : "Lost") as Status, owner: "sofia" };
  });
  return [...open, ...closed];
}

const HARBOR_OWNERS = ["sofia", "max", "nina", "omar", "paula", "quinn"] as const;
export function harborDeals(): PlannedDeal[] {
  const base: PlannedDeal[] = Array.from({ length: 330 }, (_, index) => {
    const i = index + 1;
    return {
      key: `harbor-${i}`,
      name: `Harbor-${pad(i)}`,
      value: 100 * (((i * 61) % 83) + 5),
      status: i % 3 === 0 ? "Open" : "Won",
      owner: HARBOR_OWNERS[(i * 5 + Math.floor(i / 11)) % 6],
    };
  });
  const wonTotal = (owner: string, deals: readonly PlannedDeal[]) => sum(deals.filter((deal) => deal.owner === owner && deal.status === "Won").map((deal) => deal.value));
  const gap = wonTotal("paula", base) - wonTotal("quinn", base);
  if (gap <= 0 || gap % 100 !== 0) throw new Error("Harbor tie construction needs paula ahead of quinn by whole hundreds");
  const first = Math.max(100, Math.floor(gap / 200) * 100);
  const balancing: PlannedDeal[] = [
    { key: "harbor-331", name: "Harbor-331", value: first, status: "Won", owner: "quinn" },
    { key: "harbor-332", name: "Harbor-332", value: gap - first, status: "Won", owner: "quinn" },
  ];
  return [...base, ...balancing.filter((deal) => deal.value > 0)];
}

const LUMEN_PRICES = [80, 120, 150, 180, 250] as const;
export function lumenDeals() {
  return Array.from({ length: 440 }, (_, index) => {
    const i = index + 1;
    const exact = i % 37 === 0;
    const first = exact ? 1 : (i * 3) % 5;
    const second = exact ? 3 : (first + 1 + ((i * 7) % 4)) % 5;
    const firstQuantity = exact ? 4 : (i % 9) + 1;
    const secondQuantity = exact ? 4 : ((i * 5) % 7) + 1;
    return {
      key: `lumen-${i}`,
      name: `Lumen-${pad(i)}`,
      status: (i % 11 === 0 ? "Won" : "Open") as Status,
      lines: [
        [first, firstQuantity],
        [second, secondQuantity],
      ] as const,
    };
  }).map((deal) => {
    const value = sum(deal.lines.map(([service, quantity]) => LUMEN_PRICES[service] * quantity));
    const quantity = sum(deal.lines.map(([, count]) => count));
    return { ...deal, value, quantity };
  });
}

const FIRST_NAMES = ["Anna", "Ben", "Clara", "David", "Elif", "Felix", "Greta", "Hugo", "Ines", "Jonas", "Katja", "Lukas", "Mara", "Nico", "Olga", "Paul", "Rosa", "Sven", "Tara", "Uwe"];
const LAST_NAMES = ["Albrecht", "Brandt", "Castell", "Dorn", "Engel", "Falk", "Graf", "Hahn", "Imhof", "Jung", "Kraus", "Lorenz", "Maurer", "Nagel", "Ott", "Pohl", "Quast", "Roth", "Sauer", "Thiel", "Ulrich"];
type NameVariant = "lower" | "upper" | "doubleSpace" | "trailingSpace" | "lowerLast";
const DUPLICATE_VARIANTS: readonly (readonly [number, readonly NameVariant[]])[] = [
  [3, ["lower"]],
  [27, ["doubleSpace"]],
  [58, ["upper"]],
  [91, ["lowerLast"]],
  [133, ["trailingSpace"]],
  [177, ["lower"]],
  [214, ["doubleSpace"]],
  [260, ["lower", "doubleSpace"]],
  [311, ["upper", "trailingSpace"]],
];
function variantName(firstName: string, lastName: string, variant: NameVariant): readonly [string, string] {
  switch (variant) {
    case "lower":
      return [firstName.toLowerCase(), lastName.toLowerCase()];
    case "upper":
      return [firstName.toUpperCase(), lastName];
    case "doubleSpace":
      return [firstName, `  ${lastName}`];
    case "trailingSpace":
      return [`${firstName} `, lastName];
    case "lowerLast":
      return [firstName, lastName.toLowerCase()];
  }
}
export function importedContacts() {
  const originals = Array.from({ length: 400 }, (_, index) => {
    const i = index + 1;
    return { key: `imported-${i}`, firstName: FIRST_NAMES[i % FIRST_NAMES.length], lastName: LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length] };
  });
  const copies = DUPLICATE_VARIANTS.flatMap(([original, variants]) =>
    variants.map((variant, index) => {
      const [firstName, lastName] = variantName(originals[original - 1].firstName, originals[original - 1].lastName, variant);
      return { key: `imported-copy-${original}-${index}`, firstName, lastName };
    }),
  );
  return { originals, copies };
}

export function normalizedName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim().replace(/\s+/g, " ").toLowerCase();
}

const EXPECTED = expectedScaleAnswers();

export const SCALE_CASES: readonly ScaleCase[] = [
  {
    id: "B1",
    title: "Breakdown by status over 320 deals",
    actor: "driver",
    prompts: [
      "For all deals whose name begins with 'Orbit-', give the number of deals and their combined deal value for each Status: Open, Won and Lost. Deals whose name merely starts with 'Orbital' are not part of it. Do not change anything. Finish with one final line, exactly: RESULT open=<count>/<totalEur> won=<count>/<totalEur> lost=<count>/<totalEur> (integers with no separators)",
    ],
    judgeFacts: [`Exact figures across all 320 Orbit- deals, as count/total EUR: ${EXPECTED.B1}`, "Orbital Support deals are not Orbit- deals"],
  },
  {
    id: "B2",
    title: "Breakdown by owner over 300 deals",
    actor: "driver",
    prompts: [
      "For the open deals whose name begins with 'Summit-', give each owner's number of deals and their combined deal value. Do not change anything. Finish with one final line, exactly: RESULT <first name>=<count>/<totalEur>;<first name>=<count>/<totalEur>;... with one entry per owner, ordered by first name, integers with no separators",
    ],
    judgeFacts: [`Open Summit- deals per owner first name, as count/total EUR: ${EXPECTED.B2}`, "Won Summit- deals are excluded"],
  },
  {
    id: "B3",
    title: "Breakdown by close month over 300 deals",
    actor: "driver",
    prompts: [
      "For the won deals whose name begins with 'Comet-', give the number of deals and their combined deal value per month of their Close date, for June, July and August 2026. Leave out September and open deals. Do not change anything. Finish with one final line, exactly: RESULT jun=<count>/<totalEur> jul=<count>/<totalEur> aug=<count>/<totalEur> (integers with no separators)",
    ],
    judgeFacts: [`Won Comet- deals per close month, as count/total EUR: ${EXPECTED.B3}`, "September closes and open deals are excluded"],
  },
  {
    id: "B4",
    title: "Waiting-for-reply count over 212 inbox threads",
    actor: "driver",
    prompts: [
      "How many of my inbox conversations are still waiting for my reply, meaning the other side wrote last? List the subject of each one. Do not change anything. Finish with one final line, exactly: RESULT waiting=<count>",
    ],
    judgeFacts: [`Exactly 12 of 212 threads wait for a reply: ${EXPECTED.B4.join("; ")}`, "The other 200 threads end with our own reply"],
  },
  {
    id: "B5",
    title: "Clarified follow-up writes to exactly the named deal",
    actor: "driver",
    prompts: ["Mark the Nova Expansion deal as Won.", "The 2025 one."],
    judgeFacts: [
      "Two deals match: Nova Expansion and Nova Expansion 2025; the first turn must ask which one",
      "After the user says 'The 2025 one', only Nova Expansion 2025 is set to Won; Nova Expansion stays Open",
    ],
  },
  {
    id: "A1",
    title: "Median value over 511 open deals",
    actor: "driver",
    prompts: [
      "Among the open deals whose name begins with 'Atlas-', how many are there and what is the median deal value? Won and lost Atlas- deals are excluded. Do not change anything. Finish with one final line, exactly: RESULT count=<count> medianEur=<integer with no separators>",
    ],
    judgeFacts: [`There are ${EXPECTED.A1.count} open Atlas- deals and their median value is EUR ${EXPECTED.A1.median}`, "Won and lost Atlas- deals are excluded"],
  },
  {
    id: "A2",
    title: "Owner ranking with a tie-break over 332 deals",
    actor: "driver",
    prompts: [
      "Rank the owners of the won deals whose name begins with 'Harbor-' by the combined value of those won deals, highest first. When two owners have the same combined value, the owner with more won deals ranks higher. Do not change anything. Finish with one final line, exactly: RESULT ranking=<First Last>;<First Last>;... listing every owner once",
    ],
    judgeFacts: [`Ranking with combined won value and count: ${EXPECTED.A2.map((entry) => `${entry.name} EUR ${entry.total} (${entry.count} deals)`).join("; ")}`, "Two owners tie on combined value and are separated by their number of won deals"],
  },
  {
    id: "A3",
    title: "Per-record price-per-unit threshold over 440 deals",
    actor: "driver",
    prompts: [
      "Among the open deals whose name begins with 'Lumen-', how many have an average price per unit of at least EUR 150, where the average price per unit is the deal value divided by the deal's total quantity? A deal at exactly EUR 150 counts. Do not change anything. Finish with one final line, exactly: RESULT count=<count>",
    ],
    judgeFacts: [`${EXPECTED.A3} open Lumen- deals reach an average of at least EUR 150 per unit`, "Some deals sit at exactly EUR 150 per unit and count; won Lumen- deals are excluded"],
  },
  {
    id: "A4",
    title: "Duplicate contacts by normalized name over 411 contacts",
    actor: "driver",
    prompts: [
      "Some contacts were imported twice with small differences in capitalisation or spacing. Treat two contacts as the same person when their full names match after ignoring upper and lower case and extra spaces. How many distinct names occur more than once, and how many contact records are surplus copies, meaning every record beyond the first for each such name? Do not change anything. Finish with one final line, exactly: RESULT duplicateNames=<count> surplusRecords=<count>",
    ],
    judgeFacts: [`${EXPECTED.A4.duplicateNames} names occur more than once after normalization, with ${EXPECTED.A4.surplusRecords} surplus records`, "Seven names appear twice and two appear three times"],
  },
];

type ScaleSeedHelpers = SeedHelpers & { fullRoleId: string };

async function extraOwners(h: ScaleSeedHelpers) {
  for (const [key, firstName, lastName] of EXTRA_OWNERS)
    await h.tx.user.create({
      data: { id: h.id(key), companyId: h.companyId, roleId: h.fullRoleId, email: `${key}+${h.id(key)}@example.invalid`, firstName, lastName, status: "active", displayLanguage: "en", formattingLocale: "en", country: "de", agreeToTerms: true, onboardingWizardCompletedAt: h.fixedCreated, createdAt: h.fixedCreated, updatedAt: h.fixedCreated },
    });
}

async function plannedDeals(h: ScaleSeedHelpers, deals: readonly PlannedDeal[]) {
  for (const deal of deals) await h.deal(deal.key, deal.name, deal.value, deal.owner, deal.status);
}

export async function seedScaleCase(caseId: ScaleCaseId, h: ScaleSeedHelpers): Promise<void> {
  switch (caseId) {
    case "B1":
      await plannedDeals(h, orbitDeals());
      for (let i = 1; i <= 24; i++) await h.deal(`orbital-${i}`, `Orbital Support ${pad(i, 2)}`, 5_000 + 100 * i, "sofia", i % 2 ? "Open" : "Won");
      return;
    case "B2":
      await extraOwners(h);
      await plannedDeals(h, summitDeals());
      return;
    case "B3":
      await h.tx.customColumn.create({ data: { id: h.id("deal-close"), companyId: h.companyId, entityType: "deal", label: "Close date", type: "dateTime", options: { displayFormat: "numericalShort" } } });
      for (const deal of cometDeals()) {
        await h.deal(deal.key, deal.name, deal.value, deal.owner, deal.status);
        await h.tx.customFieldValue.create({ data: { id: h.id(`field:${deal.key}:deal-close`), companyId: h.companyId, entityType: "deal", columnId: h.id("deal-close"), type: "dateTime", value: deal.closeDate, dealId: h.id(deal.key) } });
      }
      return;
    case "B4":
      await h.tx.connectedAccount.create({
        data: { id: h.id("mail-account"), companyId: h.companyId, userId: h.id("driver"), unipileAccountId: h.id("mail-account"), provider: "mail", status: "ok", hasMessaging: true, hasCalendar: false, emailAddress: "ops@benchmark.invalid", displayName: "Benchmark Operations", createdAt: h.fixedCreated, updatedAt: h.fixedCreated },
      });
      for (const [index, thread] of inboxThreads().entries()) {
        const day = String((index % 20) + 1).padStart(2, "0");
        const question = `${thread.key}-q`;
        const answer = `${thread.key}-a`;
        await mailThread(h, thread.key, thread.subject, thread.waiting
          ? [[answer, "outbound", `2026-08-${day}T08:00:00.000Z`, "Hi Maya, following up on your request."], [question, "inbound", `2026-08-${day}T15:00:00.000Z`, "Thanks, one more question before we decide."]]
          : [[question, "inbound", `2026-08-${day}T08:00:00.000Z`, "Hello, could you help with this?"], [answer, "outbound", `2026-08-${day}T15:00:00.000Z`, "Hi Maya, here is the answer."]]);
      }
      return;
    case "B5":
      await h.organization("nova-org", "Nova Analytics GmbH");
      await h.deal("nova-deal", "Nova Expansion", 24_000, "sofia");
      await h.deal("nova-deal-2025", "Nova Expansion 2025", 18_000, "sofia");
      await h.dealOrganizationLink("nova-deal", "nova-org");
      await h.dealOrganizationLink("nova-deal-2025", "nova-org");
      return;
    case "A1":
      await plannedDeals(h, atlasDeals());
      return;
    case "A2":
      await extraOwners(h);
      await plannedDeals(h, harborDeals());
      return;
    case "A3": {
      for (const [index, price] of LUMEN_PRICES.entries())
        await h.tx.service.create({ data: { id: h.id(`lumen-service-${index}`), companyId: h.companyId, name: `Lumen unit ${price}`, amount: price, createdAt: h.fixedCreated, updatedAt: h.fixedCreated } });
      for (const deal of lumenDeals()) {
        await h.tx.deal.create({ data: { id: h.id(deal.key), companyId: h.companyId, name: deal.name, totalValue: deal.value, totalQuantity: deal.quantity, weightedValue: null, createdAt: h.fixedCreated, updatedAt: h.fixedCreated } });
        await h.tx.dealUser.create({ data: { id: h.id(`deal-owner:${deal.key}`), companyId: h.companyId, dealId: h.id(deal.key), userId: h.id("sofia") } });
        for (const [service, quantity] of deal.lines)
          await h.tx.serviceDeal.create({ data: { id: h.id(`deal-service:${deal.key}:${service}`), companyId: h.companyId, dealId: h.id(deal.key), serviceId: h.id(`lumen-service-${service}`), quantity } });
        await h.field(deal.key, "deal", "deal-status", "singleSelect", h.id(`option-${deal.status.toLowerCase()}`));
      }
      return;
    }
    case "A4": {
      const { originals, copies } = importedContacts();
      for (const contact of [...originals, ...copies]) await h.contact(contact.key, contact.firstName, contact.lastName);
      return;
    }
  }
}

export type ScaleScoreContext = {
  text: string;
  turnTexts: readonly string[];
  turnTools: readonly (readonly ObservedToolLike[])[];
  reads: readonly ObservedToolLike[];
  before: Record<string, unknown[]>;
  after: Record<string, unknown[]>;
  ids: Record<string, string>;
  unchanged: boolean;
  noMutatingTools: boolean;
  isReadCall: (tool: ObservedToolLike) => boolean;
  check: (id: string, passed: boolean) => void;
  same: (left: unknown, right: unknown) => boolean;
  rows: (snapshot: Record<string, unknown[]>, table: string) => Record<string, unknown>[];
  without: (snapshot: Record<string, unknown[]>, omittedTables: string[]) => Record<string, unknown[]>;
  soleLine: (text: string, pattern: RegExp) => RegExpExecArray | null;
};

function countAndTotal(deals: readonly { value: number }[]) {
  return `${deals.length}/${sum(deals.map((deal) => deal.value))}`;
}

export function expectedScaleAnswers() {
  const orbit = orbitDeals();
  const byStatus = (status: Status) => countAndTotal(orbit.filter((deal) => deal.status === status));
  const summitOpen = summitDeals().filter((deal) => deal.status === "Open");
  const summit = [...new Set(summitOpen.map((deal) => deal.owner))]
    .map((owner) => ({ first: OWNER_NAMES[owner].split(" ")[0], figure: countAndTotal(summitOpen.filter((deal) => deal.owner === owner)) }))
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
  const cometWon = cometDeals().filter((deal) => deal.status === "Won");
  const byMonth = (month: string) => countAndTotal(cometWon.filter((deal) => deal.closeDate.startsWith(month)));
  const atlasOpen = atlasDeals().filter((deal) => deal.status === "Open").map((deal) => deal.value).sort((a, b) => a - b);
  const harborWon = harborDeals().filter((deal) => deal.status === "Won");
  const ranking = [...new Set(harborWon.map((deal) => deal.owner))]
    .map((owner) => {
      const deals = harborWon.filter((deal) => deal.owner === owner);
      return { name: OWNER_NAMES[owner], total: sum(deals.map((deal) => deal.value)), count: deals.length };
    })
    .sort((a, b) => b.total - a.total || b.count - a.count);
  const lumen = lumenDeals().filter((deal) => deal.status === "Open" && deal.value >= 150 * deal.quantity);
  const { originals, copies } = importedContacts();
  const groups = new Map<string, number>();
  for (const contact of [...originals, ...copies]) {
    const name = normalizedName(contact.firstName, contact.lastName);
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }
  const repeated = [...groups.values()].filter((count) => count > 1);
  return {
    B1: `open=${byStatus("Open")} won=${byStatus("Won")} lost=${byStatus("Lost")}`,
    B2: summit.map((entry) => `${entry.first}=${entry.figure}`).join(";"),
    B3: `jun=${byMonth("2026-06")} jul=${byMonth("2026-07")} aug=${byMonth("2026-08")}`,
    B4: inboxThreads().filter((thread) => thread.waiting).map((thread) => thread.subject),
    B4answered: inboxThreads().filter((thread) => !thread.waiting).map((thread) => thread.subject),
    A1: { count: atlasOpen.length, median: atlasOpen[(atlasOpen.length - 1) / 2] },
    A2: ranking,
    A3: lumen.length,
    A4: { duplicateNames: repeated.length, surplusRecords: sum(repeated.map((count) => count - 1)) },
  };
}

const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();

export function scoreScaleCase(caseId: ScaleCaseId, c: ScaleScoreContext): void {
  const expected = expectedScaleAnswers();
  const readOnlyChecks = () => {
    c.check("business-state-unchanged", c.unchanged);
    c.check("no-mutating-tool-attempt", c.noMutatingTools);
  };
  const resultLine = (pattern: RegExp) => c.soleLine(c.text, pattern);
  switch (caseId) {
    case "B1":
    case "B3": {
      const line = resultLine(/^RESULT ((?:\w+=\d+\/\d+ ?){3})$/);
      c.check("final-line-well-formed", Boolean(line));
      c.check("breakdown-exact", compact(line?.[1] ?? "") === compact(expected[caseId]));
      readOnlyChecks();
      return;
    }
    case "B2": {
      const line = resultLine(/^RESULT (.+=\d+\/\d+(?:;.+=\d+\/\d+)*)$/);
      c.check("final-line-well-formed", Boolean(line));
      const entries = new Set((line?.[1] ?? "").split(";").map(compact));
      c.check("breakdown-exact", entries.size === expected.B2.split(";").length && expected.B2.split(";").every((entry) => entries.has(compact(entry))));
      readOnlyChecks();
      return;
    }
    case "B4": {
      const line = resultLine(/^RESULT waiting=(\d+)$/);
      c.check("final-line-well-formed", Boolean(line));
      c.check("waiting-count-12", Number(line?.[1]) === expected.B4.length);
      c.check("names-every-waiting-thread", expected.B4.every((subject) => c.text.includes(subject.slice(0, 11))));
      c.check("lists-no-answered-thread", !expected.B4answered.some((subject) => c.text.includes(subject.slice(0, 11))));
      readOnlyChecks();
      return;
    }
    case "B5": {
      const firstTurn = c.turnTexts[0] ?? "";
      c.check("turn-1-asks-which", /\?/.test(firstTurn) && /2025/.test(firstTurn));
      c.check("turn-1-changes-nothing", (c.turnTools[0] ?? []).every((tool) => c.isReadCall(tool) || tool.outcome !== "ok"));
      const status = (key: string) => c.rows(c.after, "customFieldValue").find((row) => row.dealId === c.ids[key] && row.columnId === c.ids["deal-status"])?.value;
      c.check("named-deal-won", status("nova-deal-2025") === c.ids["option-won"]);
      c.check("other-deal-still-open", status("nova-deal") === c.ids["option-open"]);
      const otherValues = (snapshot: Record<string, unknown[]>) => c.rows(snapshot, "customFieldValue").filter((row) => row.dealId !== c.ids["nova-deal-2025"]);
      c.check("nothing-else-changed", c.same(c.without(c.before, ["customFieldValue", "deal"]), c.without(c.after, ["customFieldValue", "deal"])) && c.same(otherValues(c.before), otherValues(c.after)));
      return;
    }
    case "A1": {
      const line = resultLine(/^RESULT count=(\d+) medianEur=(\d+)$/);
      c.check("final-line-well-formed", Boolean(line));
      c.check("count-511", Number(line?.[1]) === expected.A1.count);
      c.check("median-exact", Number(line?.[2]) === expected.A1.median);
      readOnlyChecks();
      return;
    }
    case "A2": {
      const line = resultLine(/^RESULT ranking=(.+)$/);
      c.check("final-line-well-formed", Boolean(line));
      const names = (line?.[1] ?? "").split(";").map((name) => name.trim().toLowerCase());
      c.check("ranking-exact", c.same(names, expected.A2.map((entry) => entry.name.toLowerCase())));
      readOnlyChecks();
      return;
    }
    case "A3": {
      const line = resultLine(/^RESULT count=(\d+)$/);
      c.check("final-line-well-formed", Boolean(line));
      c.check("count-exact", Number(line?.[1]) === expected.A3);
      readOnlyChecks();
      return;
    }
    case "A4": {
      const line = resultLine(/^RESULT duplicateNames=(\d+) surplusRecords=(\d+)$/);
      c.check("final-line-well-formed", Boolean(line));
      c.check("duplicate-names-exact", Number(line?.[1]) === expected.A4.duplicateNames);
      c.check("surplus-records-exact", Number(line?.[2]) === expected.A4.surplusRecords);
      readOnlyChecks();
      return;
    }
  }
}
