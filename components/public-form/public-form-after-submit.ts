import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";

export const AUTOMATION_OPEN_PARAM = "open";

export type AfterSubmitRule = {
  id: string;
  name: string;
  enabled: boolean;
  href: string;
};

export type AfterSubmitRecipients = {
  owners: string[];
  assignees: boolean;
  members: number;
};

export type AfterSubmitChain = {
  createsRecord: true;
  personListLabel: string | null;
  recipients: AfterSubmitRecipients | null;
  rules: AfterSubmitRule[];
};

type FormRef = { id: string | null; typeId: string };

export function automationOpenHref(ruleId: string): string {
  return `/automations?${AUTOMATION_OPEN_PARAM}=${encodeURIComponent(ruleId)}`;
}

export function newAutomationHref({ id, typeId }: FormRef): string {
  const params = new URLSearchParams({ new: "formSubmitted", typeId });
  if (id) params.set("sourceId", id);
  return `/automations?${params.toString()}`;
}

export function listensToForm(rule: Pick<AutomationRuleDto, "trigger">, form: FormRef): boolean {
  const { trigger } = rule;
  if (trigger.kind !== "formSubmitted") return false;
  if (trigger.sourceId) return form.id !== null && trigger.sourceId === form.id;
  return trigger.typeId === undefined || trigger.typeId === form.typeId;
}

function ownerName(rule: AutomationRuleDto): string | null {
  if (!rule.owner) return null;
  const name = `${rule.owner.firstName} ${rule.owner.lastName}`.trim();
  return name.length > 0 ? name : null;
}

function recipientsOf(rules: readonly AutomationRuleDto[]): AfterSubmitRecipients | null {
  const owners = new Set<string>();
  const members = new Set<string>();
  let assignees = false;
  let notifies = false;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const effect of rule.effects) {
      if (effect.kind !== "notify") continue;
      notifies = true;
      const owner = effect.recipients.ruleOwner ? ownerName(rule) : null;
      if (owner) owners.add(owner);
      if (effect.recipients.assignees) assignees = true;
      for (const id of effect.recipients.userIds) members.add(id);
    }
  }
  return notifies
    ? { owners: [...owners].sort((left, right) => left.localeCompare(right)), assignees, members: members.size }
    : null;
}

export function afterSubmitChain(
  rules: readonly AutomationRuleDto[],
  form: FormRef,
  personListLabel: string | null,
): AfterSubmitChain {
  const listening = rules.filter((rule) => listensToForm(rule, form));
  return {
    createsRecord: true,
    personListLabel,
    recipients: recipientsOf(listening),
    rules: listening.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      href: automationOpenHref(rule.id),
    })),
  };
}
