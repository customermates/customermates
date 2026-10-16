import { randomUUID } from "node:crypto";

import { DRAFT_THREAD_PREFIX } from "./provider";

export function newDraftThreadProviderId(): string {
  return `${DRAFT_THREAD_PREFIX}${randomUUID()}`;
}
