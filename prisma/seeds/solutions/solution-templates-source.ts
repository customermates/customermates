import type { SolutionId } from "@/core/solutions/solution-catalog";
import type { SolutionTemplate } from "@/core/solutions/solution-templates";

import { solutionContent } from "./define-solution";
import { SOLUTION_DEFINITIONS } from "./definitions";

/** The use case a reference template stands for; the demo workspaces themselves carry their fictional company's name. */
const TEMPLATE_USE_CASES: Record<SolutionId, string> = {
  smb: "Small business",
  consultants: "Consultants",
  agencies: "Agencies",
  freelancers: "Freelancers",
  startups: "Startups",
  "client-management": "Clients",
  "sales-pipeline": "Sales pipeline",
  "linkedin-crm": "LinkedIn sales",
  "whatsapp-crm": "WhatsApp CRM",
};

export function solutionTemplatesFromSeeds(): Record<SolutionId, SolutionTemplate> {
  return Object.fromEntries(
    Object.entries(SOLUTION_DEFINITIONS).map(([id, definition]) => {
      const content = solutionContent(definition, "en");
      const fields = content.fields.filter((field) => !field.archived);
      const template: SolutionTemplate = {
        workspace: TEMPLATE_USE_CASES[id as SolutionId],
        lists: content.lists.map((list) => ({
          name: list.pluralLabel,
          fields: fields
            .filter((field) => field.key.startsWith(`${list.key}.`))
            .map((field) =>
              field.options?.length && field.key !== "deal.stage"
                ? `${field.label} (${field.options.map((option) => option.label).join(", ")})`
                : field.label,
            ),
        })),
        stages: content.stages.map((stage) => stage.label),
        dashboard: content.dashboard.widgets.map((widget) => widget.title),
        calendar: (content.planner?.sources ?? []).map((source) => {
          const list = content.lists.find((candidate) => candidate.key === source.list);
          const label = (key: string) => fields.find((field) => field.key === `${source.list}.${key}`)?.label ?? key;
          return `${list?.pluralLabel ?? source.list}: ${[source.date, ...(source.end ? [source.end] : [])].map(label).join(" to ")}`;
        }),
        knowledgeBase: content.wiki.map((page) => page.title),
      };
      return [id, template];
    }),
  ) as Record<SolutionId, SolutionTemplate>;
}
