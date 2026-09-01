export type RoutineTriggerContext = {
  routineName: string;
  triggerEvent?: string | null;
  triggerEntityId?: string | null;
};

export function composeRoutinePrompt(prompt: string, context: RoutineTriggerContext): string {
  const lines = [`<routine name="${context.routineName.replace(/"/g, "'")}"`];

  if (context.triggerEvent) lines.push(` event="${context.triggerEvent}"`);
  if (context.triggerEntityId) lines.push(` entityId="${context.triggerEntityId}"`);
  lines.push(" />");

  return `${lines.join("")}\n${prompt}`;
}
