import { z } from "zod";

import { sanitizeAgentVisibleText } from "./agent-output-safety";
import { AGENT_UI_TARGET_IDS, findAgentUiTarget } from "./ui-targets";

export const AGENT_ACTIVITY_KINDS = [
  "workspace.read",
  "records.read",
  "records.create",
  "records.update",
  "records.delete",
  "records.link",
  "records.note",
  "messages.read",
  "messages.write",
  "messages.send",
  "messages.draft",
  "messages.discard",
  "messages.triage",
  "team.manage",
  "webhooks.manage",
  "accounts.connect",
  "workspace.configure",
  "workspace.setup",
  "workspace.cleanup",
  "interface.navigate",
  "interface.tour",
  "support.escalate",
  "generic",
] as const;

export type AgentActivityKind = (typeof AGENT_ACTIVITY_KINDS)[number];

export const AGENT_ACTIVITY_RESOURCES = [
  "contacts",
  "organizations",
  "deals",
  "services",
  "tasks",
  "widgets",
  "terminology",
  "messages",
] as const;

export type AgentActivityResource = (typeof AGENT_ACTIVITY_RESOURCES)[number];
export type AgentActivityRisk = "read" | "write" | "sensitive";

export const AGENT_CONSEQUENCE_ACTIONS = [
  "email.send",
  "chat.send",
  "draft.save",
  "draft.discard",
  "thread.update",
  "support.request",
  "team.invite",
  "team.update",
  "webhook.create",
  "webhook.update",
  "webhook.delete",
  "webhook.resend",
  "webhook.inspect",
  "records.delete",
  "records.link",
  "workspace.configure",
  "workspace.settings",
  "account.connect",
  "external.manage",
] as const;

export const AgentActivityConsequenceSchema = z
  .object({
    action: z.enum(AGENT_CONSEQUENCE_ACTIONS),
    target: z.string().max(240).transform(sanitizeAgentVisibleText).optional(),
    subject: z.string().max(200).transform(sanitizeAgentVisibleText).optional(),
    preview: z.string().max(240).transform(sanitizeAgentVisibleText).optional(),
    count: z.number().int().min(0).max(100).optional(),
    state: z.string().max(80).transform(sanitizeAgentVisibleText).optional(),
  })
  .strict();

export type AgentActivityConsequence = z.infer<typeof AgentActivityConsequenceSchema>;

const AgentActivityUiTargetKeySchema = z.preprocess(
  (value) => (typeof value === "string" && findAgentUiTarget(value) ? value : undefined),
  z.enum(AGENT_UI_TARGET_IDS).optional(),
);

export const AgentActivityDescriptorSchema = z.object({
  kind: z.enum(AGENT_ACTIVITY_KINDS),
  resource: z.enum(AGENT_ACTIVITY_RESOURCES).optional(),
  affectedResources: z.array(z.enum(AGENT_ACTIVITY_RESOURCES)).max(8),
  risk: z.enum(["read", "write", "sensitive"]),
  count: z.number().int().min(1).max(100).optional(),
  targetKey: AgentActivityUiTargetKeySchema,
  consequence: AgentActivityConsequenceSchema.optional(),
});

export type AgentActivityDescriptor = z.infer<typeof AgentActivityDescriptorSchema>;

const ENTITY_RESOURCES = new Set<AgentActivityResource>(["contacts", "organizations", "deals", "services", "tasks"]);

const TOOL_RESOURCE: Record<string, AgentActivityResource | undefined> = {
  create_contacts: "contacts",
  update_contacts: "contacts",
  create_organizations: "organizations",
  update_organizations: "organizations",
  create_deals: "deals",
  update_deals: "deals",
  create_services: "services",
  update_services: "services",
  create_tasks: "tasks",
  update_tasks: "tasks",
  manage_widgets: "widgets",
  manage_custom_columns: undefined,
  get_messaging_threads: "messages",
  get_activities: "messages",
  get_calendars: "messages",
  send_chat_message: "messages",
  send_email: "messages",
  save_message_draft: "messages",
  discard_message_draft: "messages",
  update_messaging_thread: "messages",
};

function entityResource(input: unknown): AgentActivityResource | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const value = record.entityType ?? record.entity;
  const plural = typeof value === "string" ? `${value}s` : "";
  return ENTITY_RESOURCES.has(plural as AgentActivityResource) ? (plural as AgentActivityResource) : undefined;
}

function descriptor(
  kind: AgentActivityKind,
  resource: AgentActivityResource | undefined,
  risk: AgentActivityRisk,
  affectedResources: AgentActivityResource[] = resource ? [resource] : [],
  consequence?: AgentActivityConsequence,
): AgentActivityDescriptor {
  return consequence
    ? { kind, resource, risk, affectedResources, consequence }
    : { kind, resource, risk, affectedResources };
}

function inputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function safeText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const sanitized = sanitizeAgentVisibleText(value).replace(/\s+/g, " ").trim();
  return sanitized ? sanitized.slice(0, max) : undefined;
}

function safeStringList(value: unknown, maxItems = 3) {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const attendee = item as Record<string, unknown>;
      const label = attendee.display_name ?? attendee.identifier;
      return typeof label === "string" ? [label] : [];
    })
    .map((item) => safeText(item, 100))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return values.length ? values.join(", ").slice(0, 240) : undefined;
}

function boundedCount(value: unknown) {
  return Array.isArray(value) ? Math.min(value.length, 100) : undefined;
}

function boundedMutationCount(input: unknown, resource: AgentActivityResource | undefined) {
  const records = Array.isArray(input) ? input : resource ? inputRecord(input)[resource] : undefined;
  return Array.isArray(records) && records.length > 0 ? Math.min(records.length, 100) : undefined;
}

function safeUiTargetKey(value: unknown) {
  return typeof value === "string" && findAgentUiTarget(value) ? value : undefined;
}

function actionValue(input: Record<string, unknown>) {
  return typeof input.action === "string" ? input.action : undefined;
}

export function describeAgentTool(toolName: string, input: unknown): AgentActivityDescriptor {
  const resource = TOOL_RESOURCE[toolName] ?? entityResource(input);
  const details = inputRecord(input);

  if (toolName === "list_ui_targets" || toolName === "get_workspace_context")
    return descriptor("workspace.read", undefined, "read");
  if (toolName === "navigate" || toolName === "highlight_element") {
    const targetKey = safeUiTargetKey(details.targetId);
    return {
      ...descriptor("interface.navigate", undefined, "read"),
      ...(targetKey ? { targetKey } : {}),
    };
  }
  if (toolName === "start_tour") return descriptor("interface.tour", undefined, "read");
  if (toolName === "open_workspace_setup") {
    return descriptor("workspace.setup", undefined, "read", [
      "contacts",
      "organizations",
      "deals",
      "services",
      "tasks",
      "widgets",
      "terminology",
    ]);
  }
  if (toolName === "request_support") {
    return descriptor("support.escalate", undefined, "sensitive", [], {
      action: "support.request",
      subject: safeText(details.subject, 200),
      preview: safeText(details.body, 240),
    });
  }
  if (toolName === "apply_workspace_setup" || toolName === "seed_demo_data") {
    return descriptor("workspace.setup", undefined, "sensitive", [
      "contacts",
      "organizations",
      "deals",
      "services",
      "tasks",
      "widgets",
      "terminology",
    ]);
  }
  if (toolName === "cleanup_workspace_setup") {
    return descriptor("workspace.cleanup", undefined, "sensitive", [
      "contacts",
      "organizations",
      "deals",
      "services",
      "tasks",
      "widgets",
      "terminology",
    ]);
  }
  if (toolName === "manage_custom_columns" || toolName === "manage_widgets") {
    return descriptor("workspace.configure", resource, "sensitive", resource ? [resource] : ["terminology"], {
      action: "workspace.configure",
      state: safeText(actionValue(details), 80),
    });
  }
  if (toolName === "update_workspace_settings") {
    return descriptor("workspace.configure", resource, "sensitive", resource ? [resource] : ["terminology"], {
      action: "workspace.settings",
      state: safeText(details.target, 80),
    });
  }
  if (toolName === "manage_team") {
    const action = actionValue(details);
    return descriptor("team.manage", undefined, "sensitive", [], {
      action: action === "invite" ? "team.invite" : "team.update",
      target: action === "invite" ? safeStringList(details.emails) : "the selected team member",
      count: action === "invite" ? boundedCount(details.emails) : undefined,
      state: safeText(details.status, 80),
    });
  }
  if (toolName === "manage_webhooks") {
    const action = actionValue(details);
    const consequenceAction =
      action === "create"
        ? "webhook.create"
        : action === "update"
          ? "webhook.update"
          : action === "delete"
            ? "webhook.delete"
            : action === "resend_delivery"
              ? "webhook.resend"
              : "webhook.inspect";
    return descriptor("webhooks.manage", undefined, "sensitive", [], {
      action: consequenceAction,
      target: safeText(details.url, 240),
      preview: safeText(details.description, 240),
      count: boundedCount(details.events),
      state: typeof details.enabled === "boolean" ? (details.enabled ? "enabled" : "disabled") : undefined,
    });
  }
  if (toolName === "connect_messaging_account") {
    return descriptor("accounts.connect", undefined, "sensitive", [], {
      action: "account.connect",
      target: safeText(details.channel, 80),
    });
  }
  if (toolName === "linkedin_manage_sales_lists" || toolName === "manage_social_relations") {
    return descriptor("generic", undefined, "sensitive", [], {
      action: "external.manage",
      state: safeText(actionValue(details), 80),
    });
  }
  if (toolName === "search_docs" || toolName === "get_docs_page")
    return descriptor("workspace.read", undefined, "read");
  if (toolName === "get_messaging_threads" || toolName === "get_activities" || toolName === "get_calendars")
    return descriptor("messages.read", "messages", "read");
  if (toolName === "send_email") {
    return descriptor("messages.send", "messages", "sensitive", ["messages"], {
      action: "email.send",
      target: safeStringList(details.to),
      subject: safeText(details.subject, 200),
      preview: safeText(details.body, 240),
      count: boundedCount(details.to),
    });
  }
  if (toolName === "send_chat_message") {
    return descriptor("messages.send", "messages", "sensitive", ["messages"], {
      action: "chat.send",
      target: safeText(details.chatName, 120) ?? safeStringList(details.attendeeIdentifiers),
      subject: safeText(details.inmailSubject, 200),
      preview: safeText(details.text, 240),
      count: boundedCount(details.attendeeIdentifiers),
    });
  }
  if (toolName === "save_message_draft") {
    return descriptor("messages.draft", "messages", "sensitive", ["messages"], {
      action: "draft.save",
      subject: safeText(details.subject, 200),
      preview: safeText(details.body, 240),
    });
  }
  if (toolName === "discard_message_draft") {
    return descriptor("messages.discard", "messages", "sensitive", ["messages"], {
      action: "draft.discard",
    });
  }
  if (toolName === "update_messaging_thread") {
    return descriptor("messages.triage", "messages", "sensitive", ["messages"], {
      action: "thread.update",
      state: safeText(details.state, 80),
    });
  }
  if (
    toolName === "get_record_schema" ||
    toolName === "list_records" ||
    toolName === "search_records" ||
    toolName === "get_records"
  )
    return descriptor("records.read", resource, "read");
  if (toolName === "update_record_notes") return descriptor("records.note", resource, "sensitive");
  if (toolName.startsWith("create_")) {
    const count = boundedMutationCount(input, resource);
    return {
      ...descriptor("records.create", resource, "write"),
      ...(count ? { count } : {}),
    };
  }
  if (toolName.startsWith("update_")) {
    const count = boundedMutationCount(input, resource);
    return {
      ...descriptor("records.update", resource, "write"),
      ...(count ? { count } : {}),
    };
  }
  if (toolName === "delete_records") {
    const count = boundedCount(details.ids);
    return {
      ...descriptor("records.delete", resource, "sensitive", resource ? [resource] : [], {
        action: "records.delete",
        count,
      }),
      ...(count ? { count } : {}),
    };
  }
  if (toolName === "manage_record_links") {
    return descriptor("records.link", resource, "sensitive", resource ? [resource] : [], {
      action: "records.link",
      count: boundedCount(details.ids),
      state: safeText(details.action, 80),
    });
  }
  return descriptor("generic", resource, "read");
}

export function isAgentToolRememberable(toolName: string) {
  if (!TOOL_RESOURCE[toolName]) return false;
  const activity = describeAgentTool(toolName, undefined);
  return activity.risk === "write" && (activity.kind === "records.create" || activity.kind === "records.update");
}

type ActivityCopy = {
  running: string;
  done: string;
  error: string;
  cancelled: string;
  detail?: string;
};
type ActivityStateCopy = Omit<ActivityCopy, "detail" | "cancelled">;

const RESOURCE_COPY: Record<"en" | "de", Record<AgentActivityResource, string>> = {
  en: {
    contacts: "contacts",
    organizations: "organizations",
    deals: "deals",
    services: "services",
    tasks: "tasks",
    widgets: "dashboard widgets",
    terminology: "workspace terminology",
    messages: "conversations",
  },
  de: {
    contacts: "Kontakte",
    organizations: "Organisationen",
    deals: "Deals",
    services: "Leistungen",
    tasks: "Aufgaben",
    widgets: "Dashboard-Widgets",
    terminology: "Workspace-Begriffe",
    messages: "Unterhaltungen",
  },
};

const RESOURCE_SINGULAR_COPY: Record<"en" | "de", Record<AgentActivityResource, string>> = {
  en: {
    contacts: "contact",
    organizations: "organization",
    deals: "deal",
    services: "service",
    tasks: "task",
    widgets: "dashboard widget",
    terminology: "workspace term",
    messages: "conversation",
  },
  de: {
    contacts: "Kontakt",
    organizations: "Organisation",
    deals: "Deal",
    services: "Leistung",
    tasks: "Aufgabe",
    widgets: "Dashboard-Widget",
    terminology: "Workspace-Begriff",
    messages: "Unterhaltung",
  },
};

type LocalizedTargetCopy = { en: string; de: string };

const NAV_TARGET_COPY: Record<string, LocalizedTargetCopy> = {
  "nav-dashboard": { en: "Dashboard", de: "Dashboard" },
  "nav-inbox": { en: "Inbox", de: "Posteingang" },
  "nav-tasks": { en: "Tasks", de: "Aufgaben" },
  "nav-contacts": { en: "Contacts", de: "Kontakte" },
  "nav-organizations": { en: "Organizations", de: "Organisationen" },
  "nav-deals": { en: "Deals", de: "Deals" },
  "nav-services": { en: "Services", de: "Leistungen" },
  "nav-search": { en: "Global search", de: "Globale Suche" },
  "nav-profile": { en: "Profile settings", de: "Profileinstellungen" },
  "nav-profile-settings": { en: "Profile settings", de: "Profileinstellungen" },
  "nav-profile-api-keys": { en: "API keys", de: "API-Schlüssel" },
  "nav-profile-connected-accounts": {
    en: "Connected accounts",
    de: "Verbundene Konten",
  },
  "nav-company": { en: "Company settings", de: "Unternehmenseinstellungen" },
  "nav-company-subscription": { en: "Subscription", de: "Abonnement" },
  "nav-company-settings": {
    en: "Company settings",
    de: "Unternehmenseinstellungen",
  },
  "nav-company-members": { en: "Team members", de: "Teammitglieder" },
  "nav-company-roles": { en: "Roles", de: "Rollen" },
  "nav-company-audit-logs": { en: "Audit logs", de: "Auditprotokoll" },
  "nav-company-webhooks": { en: "Webhooks", de: "Webhooks" },
  "nav-company-webhook-deliveries": {
    en: "Webhook deliveries",
    de: "Webhook-Zustellungen",
  },
  "nav-documentation": { en: "Documentation", de: "Dokumentation" },
  "nav-feedback": { en: "Feedback", de: "Feedback" },
};

const TARGET_SCOPE_COPY: Record<string, LocalizedTargetCopy & { enSingle?: string; deSingle?: string }> = {
  contacts: {
    en: "contacts",
    de: "Kontakte",
    enSingle: "contact",
    deSingle: "Kontakt",
  },
  organizations: {
    en: "organizations",
    de: "Organisationen",
    enSingle: "organization",
    deSingle: "Organisation",
  },
  deals: { en: "deals", de: "Deals", enSingle: "deal", deSingle: "Deal" },
  services: {
    en: "services",
    de: "Leistungen",
    enSingle: "service",
    deSingle: "Leistung",
  },
  tasks: { en: "tasks", de: "Aufgaben", enSingle: "task", deSingle: "Aufgabe" },
  "company-members": {
    en: "team members",
    de: "Teammitglieder",
    enSingle: "team member",
    deSingle: "Teammitglied",
  },
  "company-webhooks": {
    en: "webhooks",
    de: "Webhooks",
    enSingle: "webhook",
    deSingle: "Webhook",
  },
  "company-roles": {
    en: "roles",
    de: "Rollen",
    enSingle: "role",
    deSingle: "Rolle",
  },
  "company-audit-logs": { en: "audit logs", de: "Auditprotokoll" },
  "company-webhook-deliveries": {
    en: "webhook deliveries",
    de: "Webhook-Zustellungen",
  },
  "profile-settings": { en: "profile settings", de: "Profileinstellungen" },
  "company-settings": {
    en: "company settings",
    de: "Unternehmenseinstellungen",
  },
  "member-modal": { en: "team member dialog", de: "Teammitglieder-Dialog" },
  "webhook-modal": { en: "webhook dialog", de: "Webhook-Dialog" },
  "widget-modal": {
    en: "dashboard widget dialog",
    de: "Dashboard-Widget-Dialog",
  },
};

const TARGET_ACTIONS = ["display-options", "add", "search", "filter", "save", "reset"] as const;

function agentUiTargetCopy(targetKey: string, language: "en" | "de") {
  if (!findAgentUiTarget(targetKey)) return undefined;

  const navigation = NAV_TARGET_COPY[targetKey];
  if (navigation) return navigation[language];
  if (targetKey === "dashboard-add-widget")
    return language === "de" ? "Dashboard-Widget hinzufügen" : "Add dashboard widget";

  const action = TARGET_ACTIONS.find((candidate) => targetKey.endsWith(`-${candidate}`));
  if (!action) return language === "de" ? "Ausgewähltes Bedienelement" : "Selected interface control";

  const scope = targetKey.slice(0, -(action.length + 1));
  const target = TARGET_SCOPE_COPY[scope];
  if (!target) return language === "de" ? "Ausgewähltes Bedienelement" : "Selected interface control";

  if (action === "add")
    return language === "de" ? `${target.deSingle ?? target.de} hinzufügen` : `Add ${target.enSingle ?? target.en}`;

  if (action === "search") return language === "de" ? `Suche für ${target.de}` : `${target.en} search`;
  if (action === "filter") return language === "de" ? `Filter für ${target.de}` : `${target.en} filters`;
  if (action === "display-options")
    return language === "de" ? `Anzeigeoptionen für ${target.de}` : `${target.en} display options`;

  if (action === "save") return language === "de" ? `Speichern in ${target.de}` : `Save in ${target.en}`;
  return language === "de" ? `Zurücksetzen in ${target.de}` : `Reset in ${target.en}`;
}

function countedResourceCopy(
  count: number | undefined,
  resourceKey: AgentActivityResource | undefined,
  language: "en" | "de",
  resource: string | undefined,
  hasCustomTerminology: boolean,
) {
  if (count === undefined) return resource ?? (language === "de" ? "Datensätze" : "records");
  if (count === 1 && resourceKey && !hasCustomTerminology) return `1 ${RESOURCE_SINGULAR_COPY[language][resourceKey]}`;
  if (count === 1 && resource) return language === "de" ? `1 Datensatz für ${resource}` : `1 record in ${resource}`;

  return `${count} ${resource ?? (language === "de" ? "Datensätze" : "records")}`;
}

function agentConsequenceDetail(
  activity: AgentActivityDescriptor,
  language: "en" | "de",
  resource: string | undefined,
  hasCustomTerminology: boolean,
) {
  const consequence = activity.consequence;
  if (!consequence) return undefined;

  const compact = (values: Array<string | undefined>) =>
    values.filter((value): value is string => Boolean(value)).join(" · ");
  const count = consequence.count;
  const preview = consequence.preview
    ? `${language === "de" ? "Vorschau" : "Preview"}: ${consequence.preview}`
    : undefined;
  const subject = consequence.subject
    ? `${language === "de" ? "Betreff" : "Subject"}: ${consequence.subject}`
    : undefined;

  switch (consequence.action) {
    case "email.send":
      return compact([
        consequence.target
          ? `${language === "de" ? "An" : "To"}: ${consequence.target}`
          : language === "de"
            ? "E-Mail an die ausgewählten Empfänger senden"
            : "Send an email to the selected recipients",
        subject,
        preview,
      ]);
    case "chat.send":
      return compact([
        consequence.target
          ? `${language === "de" ? "An" : "To"}: ${consequence.target}`
          : language === "de"
            ? "Nachricht in der ausgewählten Unterhaltung senden"
            : "Send to the selected conversation",
        subject,
        preview,
      ]);
    case "draft.save":
      return compact([
        language === "de"
          ? "Entwurf in der ausgewählten Unterhaltung speichern"
          : "Save a draft in the selected conversation",
        subject,
        preview,
      ]);
    case "draft.discard":
      return language === "de"
        ? "Den ausgewählten gespeicherten Entwurf dauerhaft verwerfen"
        : "Permanently discard the selected saved draft";
    case "thread.update":
      return consequence.state
        ? language === "de"
          ? `Unterhaltungsstatus auf „${consequence.state}“ setzen`
          : `Set conversation state to “${consequence.state}”`
        : language === "de"
          ? "Status der ausgewählten Unterhaltung ändern"
          : "Change the selected conversation state";
    case "support.request":
      return compact([subject, preview]);
    case "team.invite":
      return consequence.target
        ? language === "de"
          ? `${count ?? 1} Einladung(en) per E-Mail senden an: ${consequence.target}`
          : `Send ${count ?? 1} invitation email(s) to: ${consequence.target}`
        : language === "de"
          ? "Einladungs-E-Mails an die ausgewählten Personen senden"
          : "Send invitation emails to the selected people";
    case "team.update":
      return compact([
        language === "de"
          ? "Rolle oder Status des ausgewählten Teammitglieds ändern"
          : "Change the selected team member’s role or status",
        consequence.state,
      ]);
    case "webhook.create":
      return compact([
        language === "de" ? "Webhook erstellen" : "Create a webhook",
        consequence.target,
        count === undefined ? undefined : language === "de" ? `${count} Ereignisse` : `${count} events`,
      ]);
    case "webhook.update":
      return compact([
        language === "de" ? "Ausgewählten Webhook ändern" : "Change the selected webhook",
        consequence.target,
        consequence.state,
      ]);
    case "webhook.delete":
      return language === "de"
        ? "Den ausgewählten Webhook dauerhaft löschen"
        : "Permanently delete the selected webhook";
    case "webhook.resend":
      return language === "de"
        ? "Die ausgewählte Webhook-Zustellung erneut senden"
        : "Resend the selected webhook delivery";
    case "webhook.inspect":
      return language === "de"
        ? "Webhook-Informationen oder Zustellungen abrufen"
        : "Inspect webhook information or deliveries";
    case "records.delete": {
      if (count === undefined) return undefined;

      const target = countedResourceCopy(count, activity.resource, language, resource, hasCustomTerminology);

      return language === "de" ? `${target} dauerhaft löschen` : `Permanently delete ${target}`;
    }
    case "records.link":
      return compact([
        consequence.state === "remove"
          ? language === "de"
            ? "Verknüpfungen entfernen"
            : "Remove relationships"
          : language === "de"
            ? "Datensätze verknüpfen"
            : "Link records",
        count === undefined ? undefined : String(count),
      ]);
    case "workspace.configure":
    case "workspace.settings":
    case "external.manage":
      return consequence.state;
    case "account.connect":
      return consequence.target
        ? language === "de"
          ? `${consequence.target} verbinden`
          : `Connect ${consequence.target}`
        : language === "de"
          ? "Einen Nachrichtenkanal verbinden"
          : "Connect a messaging channel";
  }
}

export function agentActivityCopy(
  activity: AgentActivityDescriptor,
  locale: string,
  terminology: Partial<Record<AgentActivityResource, string>> = {},
): ActivityCopy {
  const language: "en" | "de" = locale.toLowerCase().startsWith("de") ? "de" : "en";
  const resource = activity.resource
    ? (terminology[activity.resource] ?? RESOURCE_COPY[language][activity.resource])
    : undefined;
  const hasCustomTerminology = Boolean(activity.resource && terminology[activity.resource]);
  const mutationTarget = countedResourceCopy(
    activity.count,
    activity.resource,
    language,
    resource,
    hasCustomTerminology,
  );
  const mutationIsSingular = activity.count === 1;
  const uiTarget = activity.targetKey ? agentUiTargetCopy(activity.targetKey, language) : undefined;
  const detail =
    agentConsequenceDetail(activity, language, resource, hasCustomTerminology) ??
    uiTarget ??
    (resource ? resource.charAt(0).toUpperCase() + resource.slice(1) : undefined);

  const en: Record<AgentActivityKind, ActivityStateCopy> = {
    "workspace.read": {
      running: "Checking your workspace",
      done: "Checked your workspace",
      error: "Couldn’t check your workspace",
    },
    "records.read": {
      running: `Looking through ${resource ?? "your records"}`,
      done: `Reviewed ${resource ?? "your records"}`,
      error: `Couldn’t review ${resource ?? "your records"}`,
    },
    "records.create": {
      running: `Creating ${mutationTarget}`,
      done: `Created ${mutationTarget}`,
      error: `Couldn’t create ${mutationTarget}`,
    },
    "records.update": {
      running: `Updating ${mutationTarget}`,
      done: `Updated ${mutationTarget}`,
      error: `Couldn’t update ${mutationTarget}`,
    },
    "records.delete": {
      running: `Removing ${mutationTarget}`,
      done: `Removed ${mutationTarget}`,
      error: `Couldn’t remove ${mutationTarget}`,
    },
    "records.link": {
      running: "Connecting related records",
      done: "Connected related records",
      error: "Couldn’t connect the records",
    },
    "records.note": {
      running: "Updating notes",
      done: "Updated notes",
      error: "Couldn’t update the notes",
    },
    "messages.read": {
      running: "Checking conversations",
      done: "Checked conversations",
      error: "Couldn’t check conversations",
    },
    "messages.write": {
      running: "Preparing the message",
      done: "Message action completed",
      error: "Couldn’t complete the message action",
    },
    "messages.send": {
      running: "Ready to send a real message",
      done: "Sent the message",
      error: "Couldn’t send the message",
    },
    "messages.draft": {
      running: "Ready to save a draft",
      done: "Saved the draft",
      error: "Couldn’t save the draft",
    },
    "messages.discard": {
      running: "Ready to discard the draft",
      done: "Discarded the draft",
      error: "Couldn’t discard the draft",
    },
    "messages.triage": {
      running: "Ready to change the conversation state",
      done: "Changed the conversation state",
      error: "Couldn’t change the conversation state",
    },
    "team.manage": {
      running: "Ready to change team access",
      done: "Changed team access",
      error: "Couldn’t change team access",
    },
    "webhooks.manage": {
      running: "Ready to change webhook delivery",
      done: "Completed the webhook action",
      error: "Couldn’t complete the webhook action",
    },
    "accounts.connect": {
      running: "Preparing a secure connection link",
      done: "Prepared the connection link",
      error: "Couldn’t prepare the connection link",
    },
    "workspace.configure": {
      running: "Updating your workspace",
      done: "Updated your workspace",
      error: "Couldn’t update your workspace",
    },
    "workspace.setup": {
      running: "Setting up your workspace",
      done: "Workspace setup is ready",
      error: "Couldn’t finish the workspace setup",
    },
    "workspace.cleanup": {
      running: "Cleaning up starter records",
      done: "Starter-record cleanup is complete",
      error: "Couldn’t finish the cleanup",
    },
    "interface.navigate": {
      running: "Opening the right place",
      done: "Opened the right place",
      error: "Couldn’t open that view",
    },
    "interface.tour": {
      running: "Preparing your tour",
      done: "Started your tour",
      error: "Couldn’t start the tour",
    },
    "support.escalate": {
      running: "Contacting Customermates support",
      done: "Support has been contacted",
      error: "Couldn’t contact support",
    },
    generic: {
      running: "Working on your request",
      done: "Finished this step",
      error: "This step needs attention",
    },
  };
  const de: Record<AgentActivityKind, ActivityStateCopy> = {
    "workspace.read": {
      running: "Workspace wird geprüft",
      done: "Workspace wurde geprüft",
      error: "Workspace konnte nicht geprüft werden",
    },
    "records.read": {
      running: `${resource ?? "Datensätze"} werden durchsucht`,
      done: `${resource ?? "Datensätze"} wurden geprüft`,
      error: `${resource ?? "Datensätze"} konnten nicht geprüft werden`,
    },
    "records.create": {
      running: `${mutationTarget} ${mutationIsSingular ? "wird" : "werden"} erstellt`,
      done: `${mutationTarget} ${mutationIsSingular ? "wurde" : "wurden"} erstellt`,
      error: `${mutationTarget} ${mutationIsSingular ? "konnte" : "konnten"} nicht erstellt werden`,
    },
    "records.update": {
      running: `${mutationTarget} ${mutationIsSingular ? "wird" : "werden"} aktualisiert`,
      done: `${mutationTarget} ${mutationIsSingular ? "wurde" : "wurden"} aktualisiert`,
      error: `${mutationTarget} ${mutationIsSingular ? "konnte" : "konnten"} nicht aktualisiert werden`,
    },
    "records.delete": {
      running: `${mutationTarget} ${mutationIsSingular ? "wird" : "werden"} entfernt`,
      done: `${mutationTarget} ${mutationIsSingular ? "wurde" : "wurden"} entfernt`,
      error: `${mutationTarget} ${mutationIsSingular ? "konnte" : "konnten"} nicht entfernt werden`,
    },
    "records.link": {
      running: "Datensätze werden verknüpft",
      done: "Datensätze wurden verknüpft",
      error: "Datensätze konnten nicht verknüpft werden",
    },
    "records.note": {
      running: "Notizen werden aktualisiert",
      done: "Notizen wurden aktualisiert",
      error: "Notizen konnten nicht aktualisiert werden",
    },
    "messages.read": {
      running: "Unterhaltungen werden geprüft",
      done: "Unterhaltungen wurden geprüft",
      error: "Unterhaltungen konnten nicht geprüft werden",
    },
    "messages.write": {
      running: "Nachricht wird vorbereitet",
      done: "Nachrichtenaktion abgeschlossen",
      error: "Nachrichtenaktion fehlgeschlagen",
    },
    "messages.send": {
      running: "Eine echte Nachricht ist zum Senden bereit",
      done: "Nachricht wurde gesendet",
      error: "Nachricht konnte nicht gesendet werden",
    },
    "messages.draft": {
      running: "Entwurf ist zum Speichern bereit",
      done: "Entwurf wurde gespeichert",
      error: "Entwurf konnte nicht gespeichert werden",
    },
    "messages.discard": {
      running: "Entwurf ist zum Verwerfen bereit",
      done: "Entwurf wurde verworfen",
      error: "Entwurf konnte nicht verworfen werden",
    },
    "messages.triage": {
      running: "Unterhaltungsstatus ist zum Ändern bereit",
      done: "Unterhaltungsstatus wurde geändert",
      error: "Unterhaltungsstatus konnte nicht geändert werden",
    },
    "team.manage": {
      running: "Teamzugriff ist zum Ändern bereit",
      done: "Teamzugriff wurde geändert",
      error: "Teamzugriff konnte nicht geändert werden",
    },
    "webhooks.manage": {
      running: "Webhook-Aktion ist bereit",
      done: "Webhook-Aktion abgeschlossen",
      error: "Webhook-Aktion fehlgeschlagen",
    },
    "accounts.connect": {
      running: "Sicherer Verbindungslink wird vorbereitet",
      done: "Verbindungslink wurde vorbereitet",
      error: "Verbindungslink konnte nicht vorbereitet werden",
    },
    "workspace.configure": {
      running: "Workspace wird aktualisiert",
      done: "Workspace wurde aktualisiert",
      error: "Workspace konnte nicht aktualisiert werden",
    },
    "workspace.setup": {
      running: "Workspace wird eingerichtet",
      done: "Workspace-Einrichtung ist fertig",
      error: "Workspace-Einrichtung fehlgeschlagen",
    },
    "workspace.cleanup": {
      running: "Starteinträge werden bereinigt",
      done: "Starteinträge wurden bereinigt",
      error: "Bereinigung fehlgeschlagen",
    },
    "interface.navigate": {
      running: "Die passende Ansicht wird geöffnet",
      done: "Passende Ansicht wurde geöffnet",
      error: "Ansicht konnte nicht geöffnet werden",
    },
    "interface.tour": {
      running: "Tour wird vorbereitet",
      done: "Tour wurde gestartet",
      error: "Tour konnte nicht gestartet werden",
    },
    "support.escalate": {
      running: "Customermates Support wird kontaktiert",
      done: "Support wurde kontaktiert",
      error: "Support konnte nicht kontaktiert werden",
    },
    generic: {
      running: "Anfrage wird bearbeitet",
      done: "Schritt abgeschlossen",
      error: "Dieser Schritt benötigt Aufmerksamkeit",
    },
  };

  return {
    ...(language === "de" ? de[activity.kind] : en[activity.kind]),
    cancelled: language === "de" ? "Gestoppt" : "Stopped",
    detail,
  };
}
