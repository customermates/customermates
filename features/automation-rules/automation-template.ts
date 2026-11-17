export type AutomationTemplateContext = {
  record?: { name: string };
  rule: { name: string };
};

export const RECORD_NAME_TOKEN = "{{record.name}}";

export const AUTOMATION_AGENT_RECORD_VALUE_MAX_CHARS = 200;

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g;

export function renderAutomationTemplate(text: string, context: AutomationTemplateContext): string {
  return text.replace(PLACEHOLDER, (match, path: string) => {
    if (path === "record.name") return context.record?.name ?? "";
    if (path === "rule.name") return context.rule.name;
    return match;
  });
}

export type AutomationAgentPrompt = { prompt: string; recordValues: number };

export function renderAutomationAgentPrompt(
  text: string,
  context: AutomationTemplateContext,
  markUntrusted: (value: string) => string,
): AutomationAgentPrompt {
  let recordValues = 0;
  const prompt = text.replace(PLACEHOLDER, (match, path: string) => {
    if (path === "rule.name") return context.rule.name;
    if (path !== "record.name") return match;
    const value = (context.record?.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, AUTOMATION_AGENT_RECORD_VALUE_MAX_CHARS);
    if (!value) return "";
    recordValues += 1;
    return markUntrusted(value);
  });
  return { prompt, recordValues };
}
