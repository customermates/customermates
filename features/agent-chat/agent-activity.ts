import { z } from "zod";

import { approvalFreeActionsForTool } from "./gated-tools";

import { sanitizeAgentVisibleText } from "./agent-output-safety";
import type { AgentTranslator } from "./agent-translator";

export const AGENT_ACTIVITY_KINDS = [
  "workspace.read",
  "records.read",
  "records.create",
  "records.update",
  "records.delete",
  "records.link",
  "records.note",
  "messages.read",
  "messages.send",
  "messages.draft",
  "messages.discard",
  "messages.triage",
  "team.manage",
  "webhooks.manage",
  "accounts.connect",
  "workspace.configure",
  "interface.navigate",
  "interface.tour",
  "interface.configure",
  "interface.fill",
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

export const AgentActivityDescriptorSchema = z.object({
  kind: z.enum(AGENT_ACTIVITY_KINDS),
  resource: z.enum(AGENT_ACTIVITY_RESOURCES).optional(),
  affectedResources: z.array(z.enum(AGENT_ACTIVITY_RESOURCES)).max(8),
  risk: z.enum(["read", "write", "sensitive"]),
  count: z.number().int().min(1).max(100).optional(),
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

function actionValue(input: Record<string, unknown>) {
  return typeof input.action === "string" ? input.action : undefined;
}

const MULTIPLEXED_READ_ACTIONS: Record<string, readonly string[]> = {
  manage_custom_columns: ["list"],
  manage_webhooks: ["list", "get", "list_deliveries"],
  manage_widgets: ["list", "get"],
};

function isMultiplexedRead(toolName: string, details: Record<string, unknown>): boolean {
  const action = actionValue(details);
  return Boolean(action && MULTIPLEXED_READ_ACTIONS[toolName]?.includes(action));
}

function multiplexedRisk(toolName: string, details: Record<string, unknown>): "write" | "sensitive" {
  const approvalFree = approvalFreeActionsForTool(toolName);
  const action = actionValue(details);
  return approvalFree && action && approvalFree.includes(action) ? "write" : "sensitive";
}

export function describeAgentTool(toolName: string, input: unknown): AgentActivityDescriptor {
  const resource = TOOL_RESOURCE[toolName] ?? entityResource(input);
  const details = inputRecord(input);

  if (toolName === "list_ui_targets" || toolName === "get_workspace_context")
    return descriptor("workspace.read", undefined, "read");
  if (toolName === "navigate" || toolName === "highlight_element" || toolName === "open_record")
    return descriptor("interface.navigate", undefined, "read");
  if (toolName === "configure_view") return descriptor("interface.configure", undefined, "read");
  if (toolName === "fill_form") {
    const fieldCount = boundedCount(details.fields);
    return {
      ...descriptor("interface.fill", undefined, details.submit === true ? "write" : "read"),
      ...(fieldCount ? { count: fieldCount } : {}),
    };
  }
  if (toolName === "start_tour") return descriptor("interface.tour", undefined, "read");
  if (toolName === "request_support") {
    return descriptor("support.escalate", undefined, "sensitive", [], {
      action: "support.request",
      subject: safeText(details.subject, 200),
      preview: safeText(details.body, 240),
    });
  }
  if (isMultiplexedRead(toolName, details)) return descriptor("workspace.read", undefined, "read");
  if (toolName === "manage_custom_columns" || toolName === "manage_widgets") {
    return descriptor(
      "workspace.configure",
      resource,
      multiplexedRisk(toolName, details),
      resource ? [resource] : ["terminology"],
      {
        action: "workspace.configure",
        state: safeText(actionValue(details), 80),
      },
    );
  }
  if (toolName === "update_workspace_settings") {
    return descriptor("workspace.configure", resource, "write", resource ? [resource] : ["terminology"], {
      action: "workspace.settings",
      state: safeText(details.target, 80),
    });
  }
  if (toolName === "manage_team") {
    const action = actionValue(details);
    return descriptor("team.manage", undefined, "write", [], {
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
    return descriptor("webhooks.manage", undefined, multiplexedRisk(toolName, details), [], {
      action: consequenceAction,
      target: safeText(details.url, 240),
      preview: safeText(details.description, 240),
      count: boundedCount(details.events),
      state: typeof details.enabled === "boolean" ? (details.enabled ? "enabled" : "disabled") : undefined,
    });
  }
  if (toolName === "connect_messaging_account") {
    return descriptor("accounts.connect", undefined, "write", [], {
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
    return descriptor("messages.draft", "messages", "write", ["messages"], {
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
    return descriptor("messages.triage", "messages", "write", ["messages"], {
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
  if (toolName === "update_record_notes") return descriptor("records.note", resource, "write");
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
    return descriptor("records.link", resource, "write", resource ? [resource] : [], {
      action: "records.link",
      count: boundedCount(details.ids),
      state: safeText(details.action, 80),
    });
  }
  return descriptor("generic", resource, "read");
}

type ActivityCopy = {
  running: string;
  done: string;
  error: string;
  cancelled: string;
  detail?: string;
};

function countedResourceCopy(
  count: number | undefined,
  resourceKey: AgentActivityResource | undefined,
  t: AgentTranslator,
  resource: string | undefined,
  hasCustomTerminology: boolean,
) {
  const fallback = resource ?? t("AgentChat.activity.defaultRecords");
  if (count === undefined) return fallback;
  if (count === 1 && resourceKey && !hasCustomTerminology) {
    return t("AgentChat.activity.countedSingular", {
      resource: t(`AgentChat.activity.resourceSingular.${resourceKey}`),
    });
  }
  if (count === 1 && resource) return t("AgentChat.activity.countedRecordInResource", { resource });

  return t("AgentChat.activity.countedResource", { count, resource: fallback });
}

function agentConsequenceDetail(
  activity: AgentActivityDescriptor,
  t: AgentTranslator,
  resource: string | undefined,
  hasCustomTerminology: boolean,
) {
  const consequence = activity.consequence;
  if (!consequence) return undefined;

  const compact = (values: Array<string | undefined>) =>
    values.filter((value): value is string => Boolean(value)).join(" · ");
  const count = consequence.count;
  const labelled = (name: string, value: string | undefined) =>
    value ? `${t(`AgentChat.activity.label.${name}`)}: ${value}` : undefined;
  const preview = labelled("preview", consequence.preview);
  const subject = labelled("subject", consequence.subject);
  const recipient = labelled("to", consequence.target);

  switch (consequence.action) {
    case "email.send":
      return compact([recipient ?? t("AgentChat.activity.consequence.emailSend"), subject, preview]);
    case "chat.send":
      return compact([recipient ?? t("AgentChat.activity.consequence.chatSend"), subject, preview]);
    case "draft.save":
      return compact([t("AgentChat.activity.consequence.draftSave"), subject, preview]);
    case "draft.discard":
      return t("AgentChat.activity.consequence.draftDiscard");
    case "thread.update":
      return consequence.state
        ? t("AgentChat.activity.consequence.threadUpdateState", { state: consequence.state })
        : t("AgentChat.activity.consequence.threadUpdate");
    case "support.request":
      return compact([subject, preview]);
    case "team.invite":
      return consequence.target
        ? t("AgentChat.activity.consequence.teamInviteTarget", { count: count ?? 1, target: consequence.target })
        : t("AgentChat.activity.consequence.teamInvite");
    case "team.update":
      return compact([t("AgentChat.activity.consequence.teamUpdate"), consequence.state]);
    case "webhook.create":
      return compact([
        t("AgentChat.activity.consequence.webhookCreate"),
        consequence.target,
        count === undefined ? undefined : t("AgentChat.activity.consequence.webhookEvents", { count }),
      ]);
    case "webhook.update":
      return compact([t("AgentChat.activity.consequence.webhookUpdate"), consequence.target, consequence.state]);
    case "webhook.delete":
      return t("AgentChat.activity.consequence.webhookDelete");
    case "webhook.resend":
      return t("AgentChat.activity.consequence.webhookResend");
    case "webhook.inspect":
      return t("AgentChat.activity.consequence.webhookInspect");
    case "records.delete": {
      if (count === undefined) return undefined;

      return t("AgentChat.activity.consequence.recordsDelete", {
        target: countedResourceCopy(count, activity.resource, t, resource, hasCustomTerminology),
      });
    }
    case "records.link":
      return compact([
        consequence.state === "remove"
          ? t("AgentChat.activity.consequence.recordsUnlink")
          : t("AgentChat.activity.consequence.recordsLink"),
        count === undefined ? undefined : String(count),
      ]);
    case "workspace.configure":
    case "workspace.settings":
    case "external.manage":
      return consequence.state;
    case "account.connect":
      return consequence.target
        ? t("AgentChat.activity.consequence.accountConnectTarget", { target: consequence.target })
        : t("AgentChat.activity.consequence.accountConnect");
  }
}

export function agentActivityCopy(
  activity: AgentActivityDescriptor,
  t: AgentTranslator,
  terminology: Partial<Record<AgentActivityResource, string>> = {},
): ActivityCopy {
  const resource = activity.resource
    ? (terminology[activity.resource] ?? t(`AgentChat.activity.resource.${activity.resource}`))
    : undefined;
  const hasCustomTerminology = Boolean(activity.resource && terminology[activity.resource]);
  const mutationTarget = countedResourceCopy(activity.count, activity.resource, t, resource, hasCustomTerminology);
  const detail =
    agentConsequenceDetail(activity, t, resource, hasCustomTerminology) ??
    (resource ? resource.charAt(0).toUpperCase() + resource.slice(1) : undefined);
  const state = (name: "running" | "done" | "error") =>
    t(`AgentChat.activity.state.${activity.kind}.${name}`, {
      count: activity.count ?? 0,
      resource: resource ?? t("AgentChat.activity.yourRecords"),
      target: mutationTarget,
    });

  return {
    running: state("running"),
    done: state("done"),
    error: state("error"),
    cancelled: t("AgentChat.activity.cancelled"),
    ...(detail ? { detail } : {}),
  };
}
