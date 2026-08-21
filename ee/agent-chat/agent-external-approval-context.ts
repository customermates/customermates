import {
  getGetSocialProfileInteractor,
  getLinkedinListSalesListsInteractor,
  getListRelationRequestsInteractor,
} from "@/core/di";

export type AgentApprovalContextResolution = { ok: true; input: unknown } | { ok: false; result: string };

const VERIFICATION_FAILED =
  "The Assistant could not verify the external target for approval. Refresh the provider data and try again.";
const MAX_VERIFICATION_PAGES = 3;

function inputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function personLabel(
  value:
    | {
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        public_identifier?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!value) return null;
  const displayName = requiredString(value.display_name);
  if (displayName) return displayName;
  const fullName = [value.first_name, value.last_name]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .join(" ")
    .trim();
  return fullName || requiredString(value.public_identifier);
}

async function resolveProfileLabel(connectedAccountId: string, identifier: string) {
  const result = await getGetSocialProfileInteractor().invoke({
    connectedAccountId,
    identifier,
  });
  return result.ok ? personLabel(result.data) : null;
}

async function resolveRelationLabel(args: {
  connectedAccountId: string;
  invitationId: string;
  directions: readonly ("received" | "sent")[];
  preferredDirection?: "received" | "sent";
  cursor?: string;
  offset?: number;
}) {
  type Page = {
    direction: "received" | "sent";
    cursor?: string;
    offset?: number;
  };
  const queue: Page[] = [];
  const queued = new Set<string>();
  const enqueue = (page: Page) => {
    const key = `${page.direction}:${page.cursor ? `cursor:${page.cursor}` : `offset:${page.offset ?? 0}`}`;
    if (queued.has(key)) return;
    queued.add(key);
    queue.push(page);
  };

  if (
    args.preferredDirection &&
    args.directions.includes(args.preferredDirection) &&
    (args.cursor || args.offset !== undefined)
  ) {
    enqueue({
      direction: args.preferredDirection,
      cursor: args.cursor,
      offset: args.cursor ? undefined : args.offset,
    });
  }
  args.directions.forEach((direction) => enqueue({ direction }));

  let reads = 0;
  while (queue.length && reads < MAX_VERIFICATION_PAGES) {
    const page = queue.shift();
    if (!page) break;
    reads += 1;
    const result = await getListRelationRequestsInteractor().invoke({
      connectedAccountId: args.connectedAccountId,
      direction: page.direction,
      cursor: page.cursor,
      offset: page.cursor ? undefined : page.offset,
      limit: 100,
    });
    if (!result.ok) return null;
    const request = result.data.data.find((candidate) => candidate.id === args.invitationId);
    const label = personLabel(request?.user);
    if (label) return label;

    const nextCursor = requiredString(result.data.next_cursor);
    if (nextCursor) enqueue({ direction: page.direction, cursor: nextCursor });
    else if (!page.cursor && result.data.data.length === 100) {
      enqueue({
        direction: page.direction,
        offset: (page.offset ?? 0) + result.data.data.length,
      });
    }
  }
  return null;
}

async function resolveSalesListLabel(args: {
  connectedAccountId: string;
  kind: "leads" | "accounts";
  listId: string;
  offset?: number;
}) {
  const queue: number[] = [];
  const queued = new Set<number>();
  const enqueue = (offset: number) => {
    if (queued.has(offset)) return;
    queued.add(offset);
    queue.push(offset);
  };
  if (args.offset && args.offset > 0) enqueue(args.offset);
  enqueue(0);

  let reads = 0;
  while (queue.length && reads < MAX_VERIFICATION_PAGES) {
    const offset = queue.shift();
    if (offset === undefined) break;
    reads += 1;
    const result = await getLinkedinListSalesListsInteractor().invoke({
      connectedAccountId: args.connectedAccountId,
      kind: args.kind,
      offset: offset || undefined,
      limit: 100,
    });
    if (!result.ok) return null;
    const label = requiredString(result.data.data.find((list) => list.id === args.listId)?.name);
    if (label) return label;
    if (result.data.data.length === 100) enqueue(offset + result.data.data.length);
  }
  return null;
}

export async function resolveAgentApprovalContext(
  toolName: string,
  input: unknown,
): Promise<AgentApprovalContextResolution> {
  if (toolName !== "manage_social_relations" && toolName !== "linkedin_manage_sales_lists") return { ok: true, input };

  const details = inputRecord(input);
  const connectedAccountId = requiredString(details.connectedAccountId);
  if (!connectedAccountId) return { ok: false, result: VERIFICATION_FAILED };

  if (toolName === "manage_social_relations") {
    const action = details.action;
    let targetLabel: string | null = null;
    if (action === "invite") {
      const identifier = requiredString(details.identifier);
      if (!identifier) return { ok: false, result: VERIFICATION_FAILED };
      targetLabel = await resolveProfileLabel(connectedAccountId, identifier);
    } else if (action === "accept" || action === "cancel") {
      const invitationId = requiredString(details.invitationId);
      const preferredDirection = action === "accept" ? "received" : details.direction === "sent" ? "sent" : "received";
      if (!invitationId) return { ok: false, result: VERIFICATION_FAILED };
      targetLabel = await resolveRelationLabel({
        connectedAccountId,
        invitationId,
        directions: action === "accept" ? ["received"] : ["sent", "received"],
        preferredDirection,
        cursor: requiredString(details.cursor) ?? undefined,
        offset: nonNegativeInteger(details.offset),
      });
    } else return { ok: false, result: VERIFICATION_FAILED };

    return targetLabel ? { ok: true, input: { ...details, targetLabel } } : { ok: false, result: VERIFICATION_FAILED };
  }

  if (details.action !== "save") return { ok: false, result: VERIFICATION_FAILED };
  const providerId = requiredString(details.providerId);
  const listId = requiredString(details.listId);
  const kind = details.kind === "accounts" ? "accounts" : details.kind === "leads" ? "leads" : null;
  if (!providerId || !listId || !kind) return { ok: false, result: VERIFICATION_FAILED };
  const offset = nonNegativeInteger(details.offset);
  const [targetLabel, listLabel] = await Promise.all([
    resolveProfileLabel(connectedAccountId, providerId),
    resolveSalesListLabel({ connectedAccountId, kind, listId, offset }),
  ]);

  return targetLabel && listLabel
    ? { ok: true, input: { ...details, targetLabel, listLabel } }
    : { ok: false, result: VERIFICATION_FAILED };
}
