export function isReadOnlyTool(tool: { annotations?: Record<string, boolean> }) {
  return tool.annotations?.readOnlyHint === true;
}
