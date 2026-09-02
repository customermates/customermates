export type RoutineTriggerContext = {
  routineName: string;
  triggerEvent?: string | null;
  triggerEntityId?: string | null;
};

export function composeRoutinePrompt(prompt: string, context: RoutineTriggerContext): string {
  if (!context.triggerEvent) return prompt;

  const attributes = [`event="${context.triggerEvent}"`];
  if (context.triggerEntityId) attributes.push(`entityId="${context.triggerEntityId}"`);

  return `<routine_trigger ${attributes.join(" ")} />\n${prompt}`;
}

const ROUTINE_TRIGGER_BLOCK = /^<routine_trigger\b[^>]*\/>\n?/;

export function stripRoutineTriggerBlock(text: string): string {
  return text.replace(ROUTINE_TRIGGER_BLOCK, "");
}
