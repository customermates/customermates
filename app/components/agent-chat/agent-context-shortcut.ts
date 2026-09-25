export type AgentContextSlashCommandInput = {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing: boolean;
  key: string;
  metaKey: boolean;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
};

export function isAgentContextSlashCommand(input: AgentContextSlashCommandInput) {
  if (input.key !== "/" || input.altKey || input.ctrlKey || input.metaKey || input.isComposing) return false;
  const caret = input.selectionStart;
  if (caret === null || input.selectionEnd === null || caret !== input.selectionEnd) return false;

  const characterBeforeCaret = input.value[caret - 1];
  return caret === 0 || /\s/u.test(characterBeforeCaret ?? "");
}
