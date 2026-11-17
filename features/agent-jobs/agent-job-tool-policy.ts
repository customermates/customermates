export type AgentJobToolContext = {
  untrusted: boolean;
  ruleChain: readonly string[];
};

export const AGENT_JOB_WIKI_REFUSAL =
  "Knowledge Base pages cannot be created, updated or deleted in an agent run, because nobody can review a proposal here. Nothing was changed. Say in your report what should change.";

export const AGENT_JOB_UNTRUSTED_REFUSAL =
  "Not available in this run: the event that started it came from outside the workspace or the instruction carries text copied from a record, so the run may not send emails or chat messages, invite people, or create, change or start webhooks and routines. Nothing was sent or changed. Say in your report what should be sent or changed, so that a person can decide.";

export const AGENT_JOB_ROUTINE_LOOP_REFUSAL =
  "Not available in this run: an automation rule started it, and a routine that is started from here or that reacts to events could start that rule again without end. Nothing was changed. A scheduled routine can still be created, and updated when the call names triggerKind schedule. Say in your report what should happen instead.";

const WIKI_TOOL = "manage_wiki_pages";
const WIKI_WRITE_ACTIONS: readonly string[] = ["create", "update", "delete"];
const ROUTINE_TOOL = "manage_routines";
const EVENT_ROUTINE_FIELDS = ["triggerEvents", "recordTrigger", "recordSources"] as const;

const OUTWARD_TOOLS: ReadonlySet<string> = new Set(["send_email", "send_chat_message"]);
const OUTWARD_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  manage_webhooks: ["create", "update"],
  manage_routines: ["create", "update", "run_now"],
  manage_social_relations: ["invite"],
};

function fieldsOf(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function actionOf(input: unknown): string | null {
  const { action } = fieldsOf(input);
  return typeof action === "string" ? action : null;
}

export function isAgentJobWikiWrite(name: string, input: unknown): boolean {
  return name === WIKI_TOOL && WIKI_WRITE_ACTIONS.includes(actionOf(input) ?? "");
}

export function isAgentJobOutwardCall(name: string, input: unknown): boolean {
  if (OUTWARD_TOOLS.has(name)) return true;
  return (OUTWARD_ACTIONS[name] ?? []).includes(actionOf(input) ?? "");
}

function isSet(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value != null;
}

export function isAgentJobRoutineLoopCall(name: string, input: unknown): boolean {
  if (name !== ROUTINE_TOOL) return false;
  const action = actionOf(input);
  if (action === "run_now") return true;
  if (action !== "create" && action !== "update") return false;
  const fields = fieldsOf(input);
  if (fields.triggerKind === "event" || EVENT_ROUTINE_FIELDS.some((field) => isSet(fields[field]))) return true;
  return action === "update" && fields.triggerKind !== "schedule";
}

export function agentJobToolPolicyRefusal(name: string, input: unknown, context: AgentJobToolContext): string | null {
  if (isAgentJobWikiWrite(name, input)) return AGENT_JOB_WIKI_REFUSAL;
  if (context.untrusted && isAgentJobOutwardCall(name, input)) return AGENT_JOB_UNTRUSTED_REFUSAL;
  if (context.ruleChain.length > 0 && isAgentJobRoutineLoopCall(name, input)) return AGENT_JOB_ROUTINE_LOOP_REFUSAL;
  return null;
}
