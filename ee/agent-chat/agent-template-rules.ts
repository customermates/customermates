import type { GetAutomationRulesInteractor } from "@/features/automation-rules/get-automation-rules.interactor";
import type { RecordRepo } from "@/features/records/record.repo";
import type { WorkspaceSetupRepo } from "@/ee/workspace-setup/workspace-setup.repo";
import type { TemplateRuleInputs } from "@/core/templates/template-rule-inputs";

import { compileTemplate } from "@/core/templates/compile-template";
import { compileTemplateAutomation } from "@/core/templates/compile-template-automation";
import { getTemplate, getTemplateText } from "@/core/templates/template-registry";
import { isTemplateSlug } from "@/core/templates/template-slugs";
import { templateRuleInputs } from "@/core/templates/template-rule-inputs";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { createSetupResolver } from "@/features/workspace-setup/setup-references";

export const TEMPLATE_RULES_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const RULE_LIST_PAGE_SIZE = 100;
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_HOUR = 8;

export function renderTemplateRulesBrief(templateName: string, inputs: TemplateRuleInputs): string | null {
  if (inputs.ready.length === 0) return null;
  return [
    `Template rules: this workspace was built from the template "${templateName}" and its rules are not in place yet. Offer them once, in your own words and the user's language: name each rule below, say in one sentence what it does, mention a note where one is given, and ask which ones to create. Create nothing before the user agrees.`,
    "After the user agrees, load the routines toolset when manage_rules is not loaded yet, then call manage_rules with action create and the listed input exactly as given, one rule per call. Every call raises an approval card for the user, and that approval is their confirmation; request one at a time. Pass enabled false instead when the user wants drafts. dateReached rules fire at 08:00 in the time zone of their input, which is UTC: ask the user for their IANA time zone once and put it into the timezone of every dateReached rule before creating. If the user declines, do not offer the rules again in this conversation. Report only rules whose tool result confirms success.",
    inputs.skipped.length > 0
      ? "Rules the rules engine cannot run are listed under skipped: tell the user which ones and why, in their language, and offer a draft routine (manage_routines with enabled false) only when they ask for one."
      : "",
    `Ready rules (JSON): ${JSON.stringify(inputs.ready.map(({ name, notes, input }) => ({ name, notes, input })))}`,
    `Skipped (JSON): ${JSON.stringify(inputs.skipped.map(({ name, reason }) => ({ name, reason })))}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export class AgentTemplateRules {
  constructor(
    private setups: Pick<WorkspaceSetupRepo, "findCurrent">,
    private records: Pick<RecordRepo, "getModel">,
    private rules: Pick<GetAutomationRulesInteractor, "invoke">,
    private now: () => Date = () => new Date(),
  ) {}

  async brief(): Promise<string | null> {
    const setup = await this.setups.findCurrent();
    const slug = setup?.interview.templateSlug;
    if (!setup?.plan || !isTemplateSlug(slug)) return null;
    if (setup.phases.dataModel?.status !== "completed" || setup.created.references.length === 0) return null;
    const since = setup.confirmedAt ?? setup.startedAt;
    if (this.now().getTime() - since.getTime() > TEMPLATE_RULES_WINDOW_DAYS * DAY_MS) return null;

    const existing = await this.rules.invoke({ owner: "all", page: 1, pageSize: RULE_LIST_PAGE_SIZE });
    if (!existing.ok) return null;
    const present = new Set(existing.data.items.map((rule) => rule.name));

    const spec = getTemplate(slug);
    const language = setup.answers.language?.value;
    const text = getTemplateText(slug, appLocaleOrDefault(language?.format === "singleChoice" ? language.value : null));
    const { extras } = compileTemplate(spec, text);
    const model = await this.records.getModel();
    const inputs = templateRuleInputs(
      compileTemplateAutomation(spec, extras.rules),
      setup.plan,
      createSetupResolver(setup.plan, { model, references: setup.created.references }),
      { timezone: DEFAULT_TIMEZONE, atHour: DEFAULT_HOUR },
    );
    return renderTemplateRulesBrief(text.name, {
      ready: inputs.ready.filter((draft) => !present.has(draft.name)),
      skipped: inputs.skipped,
    });
  }
}
