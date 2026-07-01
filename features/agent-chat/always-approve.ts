/**
 * Tools whose approval can NEVER be pre-authorized away. The authoritative signal is
 * the `alwaysApprove` annotation on the tool contract itself (see code-exec.mcp-tools.ts),
 * which the server-side gate reads directly. This name-keyed mirror exists only for the
 * two consumers that have a tool *name* and no access to the tool object: the stored
 * pre-authorization filter (pre-authorized-tools.ts) and the approval-card UI
 * (agent-message-view.tsx). The gating test pins run_code here to the real tool
 * definition so a rename can't silently desync the two.
 *
 * Leaf module (no server-only imports) so client components can import it safely.
 */
export const ALWAYS_APPROVE_TOOL_NAMES = new Set<string>(["run_code"]);

/** Custom MCP annotation key marking a tool as never-pre-authorizable. */
export const ALWAYS_APPROVE_ANNOTATION = "alwaysApprove";
