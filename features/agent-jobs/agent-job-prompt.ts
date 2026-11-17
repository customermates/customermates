export type AgentJobRecordRef = { typeId: string; recordId: string };

export function composeAgentJobPrompt(prompt: string, recordRef: AgentJobRecordRef | null): string {
  if (!recordRef) return prompt;
  return `${prompt}\n\nTriggering record: list ${recordRef.typeId}, record ${recordRef.recordId}. Read it with the CRM tools before you act.`;
}
