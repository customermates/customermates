export type AutomationTemplateContext = {
  record?: { name: string };
  rule: { name: string };
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g;

export function renderAutomationTemplate(text: string, context: AutomationTemplateContext): string {
  return text.replace(PLACEHOLDER, (match, path: string) => {
    if (path === "record.name") return context.record?.name ?? "";
    if (path === "rule.name") return context.rule.name;
    return match;
  });
}
