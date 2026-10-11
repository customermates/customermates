import { presetId } from "@/features/records/crm-preset";
import type {
  CalculationExpression,
  RecordField,
  RecordModel,
  RecordRelationship,
  RecordScalar,
  RecordType,
} from "@/features/records/record-model.schema";

import { NORTHWIND_OPTION_KEYS, type NorthwindChoiceFieldKey } from "./northwind-model";

type OptionSpec = readonly [key: string, label: string, color: string, probability?: number];

const LEAD_SOURCES: ReadonlyArray<OptionSpec> = [
  ["websiteDemo", "Website demo request", "success"],
  ["contentDownload", "Content download", "secondary"],
  ["webinar", "Webinar", "info"],
  ["tradeFair", "Trade fair", "warning"],
  ["paidSearch", "Paid search", "default"],
  ["linkedin", "LinkedIn", "info"],
  ["outbound", "Outbound", "secondary"],
  ["partnerReferral", "Partner referral", "warning"],
  ["customerReferral", "Customer referral", "success"],
];

const OPTION_LABELS: { [F in NorthwindChoiceFieldKey]: ReadonlyArray<OptionSpec> } = {
  "organization.industry": [
    ["facilityManagement", "Facility management", "info"],
    ["hvac", "HVAC", "warning"],
    ["elevators", "Elevators and escalators", "secondary"],
    ["utilities", "Utilities", "success"],
    ["logistics", "Logistics", "default"],
    ["medicalDevices", "Medical devices", "destructive"],
    ["solar", "Solar installation", "warning"],
    ["propertyManagement", "Property management", "info"],
    ["securitySystems", "Security systems", "secondary"],
    ["waterTreatment", "Water treatment", "success"],
  ],
  "organization.segment": [
    ["smb", "SMB", "secondary"],
    ["midMarket", "Mid-market", "info"],
    ["enterprise", "Enterprise", "success"],
  ],
  "contact.dealRole": [
    ["decisionMaker", "Decision maker", "success"],
    ["champion", "Champion", "info"],
    ["influencer", "Influencer", "secondary"],
    ["user", "End user", "default"],
    ["procurement", "Procurement", "warning"],
  ],
  "contact.leadSource": LEAD_SOURCES,
  "deal.stage": [
    ["new", "New", "secondary", 10],
    ["qualified", "Qualified", "info", 25],
    ["proposal", "Proposal", "warning", 60],
    ["won", "Won", "success", 100],
    ["lost", "Lost", "destructive", 0],
  ],
  "deal.dealType": [
    ["new", "New", "info"],
    ["expansion", "Expansion", "success"],
    ["renewal", "Renewal", "secondary"],
  ],
  "deal.lostReason": [
    ["price", "Price", "warning"],
    ["noDecision", "No decision", "secondary"],
    ["competitor", "Competitor", "destructive"],
    ["timing", "Timing", "info"],
    ["productGap", "Product gap", "default"],
    ["notAFit", "Not a fit", "secondary"],
  ],
  "deal.leadSource": LEAD_SOURCES,
  "task.team": [
    ["sales", "Sales", "info"],
    ["customerSuccess", "Customer success", "success"],
    ["support", "Support", "warning"],
    ["marketing", "Marketing", "secondary"],
    ["partnerships", "Partnerships", "default"],
    ["hiring", "Hiring", "destructive"],
    ["management", "Management", "secondary"],
  ],
  "subscription.plan": [
    ["starter", "Starter", "secondary"],
    ["professional", "Professional", "info"],
    ["enterprise", "Enterprise", "success"],
  ],
  "subscription.billing": [
    ["perSeat", "Per seat", "secondary"],
    ["annualPrice", "Annual flat price", "info"],
  ],
  "subscription.health": [
    ["healthy", "Green", "success"],
    ["watch", "Amber", "warning"],
    ["atRisk", "Red", "destructive"],
  ],
  "onboarding.phase": [
    ["kickoff", "Kickoff", "secondary"],
    ["configuration", "Configuration", "info"],
    ["pilot", "Pilot", "warning"],
    ["goLive", "Go-live", "warning"],
    ["hypercare", "Hypercare", "default"],
    ["completed", "Completed", "success"],
  ],
  "ticket.priority": [
    ["urgent", "P1 Critical", "destructive"],
    ["high", "P2 High", "warning"],
    ["normal", "P3 Normal", "info"],
    ["low", "P4 Low", "secondary"],
  ],
  "ticket.status": [
    ["new", "New", "info"],
    ["open", "Open", "warning"],
    ["waitingOnCustomer", "Waiting on customer", "secondary"],
    ["resolved", "Resolved", "success"],
    ["closed", "Closed", "default"],
  ],
  "ticket.category": [
    ["routing", "Route planning", "info"],
    ["mobileApp", "Technician app", "warning"],
    ["integrations", "Integrations", "secondary"],
    ["dataImport", "Data import", "default"],
    ["billing", "Billing", "success"],
    ["access", "Access and sign-in", "destructive"],
  ],
  "campaign.channel": [
    ["webinar", "Webinar", "info"],
    ["tradeFair", "Trade fair", "warning"],
    ["linkedinAds", "LinkedIn Ads", "secondary"],
    ["googleAds", "Google Ads", "default"],
    ["email", "Email", "success"],
    ["partnerEvent", "Partner event", "destructive"],
  ],
  "partner.tier": [
    ["registered", "Referral", "default"],
    ["silver", "Silver reseller", "secondary"],
    ["gold", "Gold implementation", "warning"],
  ],
  "partner.region": [
    ["dach", "DACH", "info"],
    ["benelux", "Benelux", "secondary"],
    ["nordics", "Nordics", "success"],
    ["ukIreland", "UK and Ireland", "default"],
  ],
  "openRole.department": [
    ["engineering", "Engineering", "info"],
    ["sales", "Sales", "success"],
    ["customerSuccess", "Customer success", "warning"],
    ["support", "Support", "secondary"],
    ["marketing", "Marketing", "default"],
    ["operations", "Operations", "destructive"],
  ],
  "openRole.status": [
    ["open", "Open", "success"],
    ["onHold", "On hold", "warning"],
    ["filled", "Filled", "secondary"],
  ],
  "candidate.stage": [
    ["applied", "Applied", "secondary"],
    ["screening", "Screening", "info"],
    ["interview", "Interview", "warning"],
    ["caseTask", "Case task", "info"],
    ["offer", "Offer", "default"],
    ["hired", "Hired", "success"],
    ["rejected", "Rejected", "destructive"],
  ],
  "candidate.source": [
    ["linkedin", "LinkedIn", "info"],
    ["referral", "Referral", "success"],
    ["careersPage", "Careers page", "secondary"],
    ["agency", "Agency", "warning"],
  ],
};

for (const [field, keys] of Object.entries(NORTHWIND_OPTION_KEYS)) {
  const labels = OPTION_LABELS[field as NorthwindChoiceFieldKey].map(([key]) => key);
  if (labels.join() !== keys.join()) throw new Error(`Northwind option labels drifted for ${field}`);
}

export const NORTHWIND_TYPE_DEFINITIONS = [
  [
    "subscription",
    "Subscription",
    "Subscriptions",
    "repeat",
    "Northwind Field subscriptions: seats, price and renewal.",
  ],
  [
    "onboarding",
    "Onboarding project",
    "Onboarding projects",
    "rocket",
    "Customer onboarding from kickoff to hypercare.",
  ],
  ["ticket", "Ticket", "Tickets", "lifebuoy", "Support requests from customers, with SLA tracking."],
  ["campaign", "Campaign", "Campaigns", "megaphone", "Marketing campaigns and the pipeline they source."],
  ["partner", "Partner", "Partners", "users", "Resellers and implementation partners that refer deals."],
  ["openRole", "Open role", "Open roles", "briefcase", "Positions Northwind Labs is hiring for."],
  ["candidate", "Candidate", "Candidates", "user", "Applicants for open roles, with interview notes."],
] as const;

const EUR = "EUR";

/**
 * Extends the starter configuration (already holding the seed's legacy custom fields) into the Northwind Labs
 * demo model: new fields on the starter lists, seven custom lists, their relationships and relationship paths,
 * and every calculation kind (formula, lookup, rollup, snapshot). Mutates and returns `model`.
 */
export function applyNorthwindModel(model: RecordModel, companyId: string): RecordModel {
  const id = (key: string) => presetId(companyId, key);
  const field = (key: string): CalculationExpression => ({ kind: "field", fieldId: id(key) });
  const literal = (value: RecordScalar | null): CalculationExpression => ({ kind: "literal", value });
  const decimal = (value: string): CalculationExpression => literal({ kind: "decimal", value, currency: null });
  const operation = (
    operator: Extract<CalculationExpression, { kind: "operation" }>["operator"],
    ...args: CalculationExpression[]
  ): CalculationExpression => ({ kind: "operation", operator, arguments: args });
  const related = (
    relation: string,
    direction: "outgoing" | "incoming",
    expression: CalculationExpression,
    reducer: Extract<CalculationExpression, { kind: "related" }>["reducer"],
  ): CalculationExpression => ({ kind: "related", relationId: id(relation), direction, expression, reducer });
  const options = (key: NorthwindChoiceFieldKey): RecordField["options"] =>
    OPTION_LABELS[key].map(([option, label, color, probability]) => ({
      id: id(`${key}.${option}`),
      label,
      color,
      attributes:
        probability === undefined
          ? []
          : [{ key: "probability", value: { kind: "decimal", value: String(probability), currency: null } }],
    }));
  const position = (typeId: string) => model.fields.filter((existing) => existing.typeId === typeId).length;
  const add = (
    type: string,
    key: string,
    label: string,
    valueType: RecordField["valueType"],
    shape: Partial<Pick<RecordField, "behavior" | "multiple" | "format" | "options" | "required" | "archived">> = {},
  ): RecordField => {
    const typeId = id(type);
    const definition: RecordField = {
      id: id(key),
      typeId,
      label,
      valueType,
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      options: [],
      position: position(typeId),
      ...(valueType === "currency" ? { format: { currency: EUR } } : {}),
      ...shape,
    };
    model.fields.push(definition);
    return definition;
  };
  const choice = (type: string, key: NorthwindChoiceFieldKey, label: string, multiple = false) =>
    add(type, key, label, "select", { options: options(key), ...(multiple ? { multiple: true } : {}) });
  const relation = (
    key: string,
    source: string,
    target: string,
    sourceLabel: string,
    targetLabel: string,
    sourceCardinality: "one" | "many",
  ): void => {
    const definition: RecordRelationship = {
      id: id(key),
      sourceTypeId: id(source),
      targetTypeId: id(target),
      sourceLabel,
      targetLabel,
      sourceCardinality,
      targetCardinality: "many",
      onSourceDelete: "unlink",
      onTargetDelete: "unlink",
      messagesOnSource: false,
      messagesOnTarget: false,
      archived: false,
    };
    model.relationships.push(definition);
  };
  const type = (key: string) => {
    const found = model.types.find((candidate) => candidate.id === id(key));
    if (!found) throw new Error(`Northwind model is missing the ${key} list`);
    return found;
  };

  // Labels of the starter lists that the story renames; ids stay stable.
  Object.assign(type("service"), { label: "Product or service", pluralLabel: "Products and services" });
  const servicePrice = model.fields.find((candidate) => candidate.id === id("service.amount"));
  if (servicePrice) servicePrice.label = "Unit price";

  // A deal belongs to one organization, so the organization's industry can be looked up on it.
  const dealOrganizations = model.relationships.find((candidate) => candidate.id === id("deal.organizations"));
  if (!dealOrganizations) throw new Error("Northwind model is missing the deal organization relationship");
  dealOrganizations.sourceCardinality = "one";
  dealOrganizations.sourceLabel = "Organization";
  dealOrganizations.onSourceDelete = "unlink";

  for (const [key, label, pluralLabel, icon, description] of NORTHWIND_TYPE_DEFINITIONS) {
    const name = add(key, `${key}.name`, key === "ticket" ? "Subject" : "Name", "text", { required: true });
    add(key, `${key}.notes`, "Notes", "richText");
    const definition: RecordType = {
      id: id(key),
      label,
      pluralLabel,
      icon,
      description,
      primaryFieldId: name.id,
      parentRelationshipId: null,
      archived: false,
      embedded: false,
      navigationVisible: true,
      position: model.types.length,
    };
    model.types.push(definition);
  }

  relation("deal.campaign", "deal", "campaign", "Source campaign", "Sourced deals", "one");
  relation("deal.partner", "deal", "partner", "Referring partner", "Referred deals", "one");
  relation("subscription.organization", "subscription", "organization", "Organization", "Subscriptions", "one");
  relation("subscription.deal", "subscription", "deal", "Signed in deal", "Subscriptions", "one");
  relation("onboarding.deal", "onboarding", "deal", "Deal", "Onboarding projects", "one");
  relation("onboarding.organization", "onboarding", "organization", "Organization", "Onboarding projects", "one");
  relation("onboarding.subscription", "onboarding", "subscription", "Subscription", "Onboarding projects", "one");
  relation("ticket.subscription", "ticket", "subscription", "Subscription", "Tickets", "one");
  relation("ticket.contact", "ticket", "contact", "Reported by", "Tickets", "one");
  relation("candidate.openRole", "candidate", "openRole", "Open role", "Candidates", "one");

  // Organizations
  choice("organization", "organization.industry", "Industry");
  add("organization", "organization.companySize", "Company size", "number", { format: { decimalPlaces: 0 } });
  choice("organization", "organization.segment", "Segment");
  add("organization", "organization.channels", "Channels", "channels", { format: { onClick: "open" } });
  add("organization", "organization.arr", "ARR", "currency", {
    behavior: {
      kind: "rollup",
      expression: related("subscription.organization", "incoming", field("subscription.arr"), "sum"),
    },
  });
  add("organization", "organization.licensedSeats", "Licensed seats", "number", {
    behavior: {
      kind: "rollup",
      expression: related("subscription.organization", "incoming", field("subscription.seats"), "sum"),
    },
  });
  add("organization", "organization.openPipeline", "Open pipeline", "currency", {
    behavior: { kind: "rollup", expression: related("deal.organizations", "incoming", field("deal.openValue"), "sum") },
  });
  add("organization", "organization.legacyAccountId", "Legacy account ID", "text", { archived: true });
  type("organization").relationshipPaths = [
    {
      id: id("organization.products.path"),
      label: "Products bought",
      archived: false,
      path: [
        { relationId: id("deal.organizations"), direction: "incoming" },
        { relationId: id("lineItem.deal"), direction: "incoming" },
        { relationId: id("lineItem.service"), direction: "outgoing" },
      ],
    },
    {
      id: id("organization.tickets.path"),
      label: "Support tickets",
      archived: false,
      path: [
        { relationId: id("subscription.organization"), direction: "incoming" },
        { relationId: id("ticket.subscription"), direction: "incoming" },
      ],
    },
  ];

  // Contacts
  add("contact", "contact.jobTitle", "Job title", "text");
  choice("contact", "contact.dealRole", "Role in deal", true);
  choice("contact", "contact.leadSource", "Lead source");

  // Deals: the stage board drives the weighted value; Status keeps the outcome.
  const stage = add("deal", "deal.stage", "Stage", "select", { options: options("deal.stage") });
  choice("deal", "deal.dealType", "Type");
  choice("deal", "deal.leadSource", "Lead source");
  choice("deal", "deal.lostReason", "Lost reason");
  add("deal", "deal.openedOn", "Opened on", "date");
  add("deal", "deal.closeDate", "Close date", "date");
  add("deal", "deal.contractValue", "Contract value", "currency", {
    behavior: {
      kind: "snapshot",
      capture: "whenChanged",
      allowManualOverride: true,
      triggerFieldId: stage.id,
      triggerValue: { kind: "select", value: id("deal.stage.won") },
      expression: field("deal.totalValue"),
    },
  });
  add("lineItem", "lineItem.listAmount", "List amount", "currency", {
    behavior: {
      kind: "formula",
      expression: operation(
        "multiply",
        field("lineItem.quantity"),
        related("lineItem.service", "outgoing", field("service.amount"), "one"),
      ),
    },
  });
  add("deal", "deal.listValue", "List value", "currency", {
    behavior: { kind: "rollup", expression: related("lineItem.deal", "incoming", field("lineItem.listAmount"), "sum") },
  });
  add("lineItem", "lineItem.discountPercent", "Discount %", "number", {
    format: { decimalPlaces: 1 },
    behavior: {
      kind: "formula",
      expression: operation(
        "multiply",
        operation(
          "subtract",
          decimal("1"),
          operation(
            "divide",
            field("lineItem.effectivePrice"),
            related("lineItem.service", "outgoing", field("service.amount"), "one"),
          ),
        ),
        decimal("100"),
      ),
    },
  });
  add("deal", "deal.discountPercent", "Discount %", "number", {
    format: { decimalPlaces: 1 },
    behavior: {
      kind: "rollup",
      expression: related("lineItem.deal", "incoming", field("lineItem.discountPercent"), "max"),
    },
  });
  add("deal", "deal.daysToClose", "Days to close", "number", {
    format: { decimalPlaces: 0 },
    behavior: {
      kind: "formula",
      expression: operation("daysBetween", field("deal.openedOn"), field("deal.closeDate")),
    },
  });
  add("deal", "deal.openValue", "Open value", "currency", {
    behavior: {
      kind: "formula",
      expression: operation(
        "if",
        operation(
          "or",
          operation("equal", field("deal.stage"), literal({ kind: "select", value: id("deal.stage.won") })),
          operation("equal", field("deal.stage"), literal({ kind: "select", value: id("deal.stage.lost") })),
        ),
        literal({ kind: "decimal", value: "0", currency: EUR }),
        field("deal.totalValue"),
      ),
    },
  });
  add("deal", "deal.industry", "Industry", "select", {
    options: options("organization.industry"),
    behavior: {
      kind: "lookup",
      expression: related("deal.organizations", "outgoing", field("organization.industry"), "one"),
    },
  });
  const weighted = model.fields.find((candidate) => candidate.id === id("deal.weightedValue"));
  if (!weighted) throw new Error("Northwind model is missing the weighted value");
  weighted.behavior = {
    kind: "formula",
    expression: operation(
      "divide",
      operation("multiply", field("deal.totalValue"), {
        kind: "optionAttribute",
        fieldId: stage.id,
        attribute: "probability",
      }),
      decimal("100"),
    ),
  };

  // Tasks
  choice("task", "task.team", "Team");
  add("task", "task.dueDate", "Due date", "date");

  // Subscriptions
  choice("subscription", "subscription.plan", "Plan");
  choice("subscription", "subscription.billing", "Billing");
  add("subscription", "subscription.seats", "Seats", "number", { format: { decimalPlaces: 0 } });
  add("subscription", "subscription.pricePerSeat", "Price per seat (month)", "currency");
  add("subscription", "subscription.annualPrice", "Annual flat price", "currency");
  add("subscription", "subscription.arr", "ARR", "currency", {
    behavior: {
      kind: "formula",
      expression: operation(
        "coalesce",
        field("subscription.annualPrice"),
        operation(
          "multiply",
          operation("multiply", field("subscription.seats"), field("subscription.pricePerSeat")),
          decimal("12"),
        ),
      ),
    },
  });
  add("subscription", "subscription.startDate", "Start date", "date");
  add("subscription", "subscription.renewalDate", "Renewal date", "date");
  choice("subscription", "subscription.health", "Health");
  add("subscription", "subscription.industry", "Industry", "select", {
    options: options("organization.industry"),
    behavior: {
      kind: "lookup",
      expression: related("subscription.organization", "outgoing", field("organization.industry"), "one"),
    },
  });

  // Onboarding projects
  choice("onboarding", "onboarding.phase", "Phase");
  add("onboarding", "onboarding.owner", "Owner", "member");
  add("onboarding", "onboarding.timeline", "Timeline", "dateRange", { format: { dateFormat: "numericalShort" } });
  add("onboarding", "onboarding.progress", "Progress %", "number", { format: { decimalPlaces: 0 } });

  // Tickets
  choice("ticket", "ticket.priority", "Priority");
  choice("ticket", "ticket.status", "Status");
  choice("ticket", "ticket.category", "Category", true);
  add("ticket", "ticket.assignee", "Assignee", "member");
  add("ticket", "ticket.openedOn", "Opened on", "date");
  add("ticket", "ticket.slaDue", "SLA due date", "date");
  add("ticket", "ticket.lastResponseOn", "Last activity on", "date");
  add("ticket", "ticket.resolvedOn", "Resolved on", "date");
  add("ticket", "ticket.daysOverSla", "Days over SLA", "number", {
    format: { decimalPlaces: 0 },
    behavior: {
      kind: "formula",
      expression: operation(
        "daysBetween",
        field("ticket.slaDue"),
        operation("coalesce", field("ticket.resolvedOn"), field("ticket.lastResponseOn")),
      ),
    },
  });
  add("ticket", "ticket.overdue", "Overdue", "boolean", {
    behavior: { kind: "formula", expression: operation("greaterThan", field("ticket.daysOverSla"), decimal("0")) },
  });

  // Campaigns
  choice("campaign", "campaign.channel", "Type");
  add("campaign", "campaign.owner", "Owner", "member");
  add("campaign", "campaign.budget", "Budget", "currency");
  add("campaign", "campaign.actualSpend", "Actual spend", "currency");
  add("campaign", "campaign.period", "Period", "dateRange", { format: { dateFormat: "numericalShort" } });
  add("campaign", "campaign.dealsSourced", "Deals sourced", "number", {
    behavior: { kind: "rollup", expression: related("deal.campaign", "incoming", field("deal.name"), "count") },
  });
  add("campaign", "campaign.pipelineSourced", "Pipeline sourced", "currency", {
    behavior: { kind: "rollup", expression: related("deal.campaign", "incoming", field("deal.totalValue"), "sum") },
  });
  add("campaign", "campaign.wonRevenue", "Won revenue", "currency", {
    behavior: { kind: "rollup", expression: related("deal.campaign", "incoming", field("deal.contractValue"), "sum") },
  });
  add("campaign", "campaign.costPerDeal", "Cost per deal", "currency", {
    behavior: {
      kind: "formula",
      expression: operation("divide", field("campaign.actualSpend"), field("campaign.dealsSourced")),
    },
  });

  // Partners
  choice("partner", "partner.tier", "Tier");
  choice("partner", "partner.region", "Region");
  add("partner", "partner.website", "Website", "url", { format: { onClick: "open" } });
  add("partner", "partner.commissionRate", "Commission %", "number", { format: { decimalPlaces: 1 } });
  add("partner", "partner.annualFee", "Annual partner fee", "currency", { format: { currency: "CHF" } });
  add("partner", "partner.referredPipeline", "Referred pipeline", "currency", {
    behavior: { kind: "rollup", expression: related("deal.partner", "incoming", field("deal.totalValue"), "sum") },
  });
  add("partner", "partner.revenueInfluenced", "Revenue influenced", "currency", {
    behavior: { kind: "rollup", expression: related("deal.partner", "incoming", field("deal.contractValue"), "sum") },
  });
  add("partner", "partner.commissionDue", "Commission due", "currency", {
    behavior: {
      kind: "formula",
      expression: operation(
        "divide",
        operation("multiply", field("partner.revenueInfluenced"), field("partner.commissionRate")),
        decimal("100"),
      ),
    },
  });

  // Open roles
  choice("openRole", "openRole.department", "Department");
  choice("openRole", "openRole.status", "Status");
  add("openRole", "openRole.hiringManager", "Hiring manager", "member");
  add("openRole", "openRole.salaryBudget", "Salary budget", "currency");
  add("openRole", "openRole.targetStart", "Target start", "date");
  add("openRole", "openRole.candidateCount", "Candidates", "number", {
    behavior: {
      kind: "rollup",
      expression: related("candidate.openRole", "incoming", field("candidate.name"), "count"),
    },
  });

  // Candidates
  choice("candidate", "candidate.stage", "Stage");
  choice("candidate", "candidate.source", "Source");
  add("candidate", "candidate.email", "Email", "email", { format: { onClick: "copy" } });
  add("candidate", "candidate.appliedOn", "Applied on", "date");
  add("candidate", "candidate.salaryExpectation", "Salary expectation", "currency");
  add("candidate", "candidate.interviewers", "Interviewer", "member");
  add("candidate", "candidate.interviewNotes", "Interview notes", "richText");
  add("candidate", "candidate.department", "Department", "select", {
    options: options("openRole.department"),
    behavior: {
      kind: "lookup",
      expression: related("candidate.openRole", "outgoing", field("openRole.department"), "one"),
    },
  });

  return model;
}
