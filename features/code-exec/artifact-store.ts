import crypto from "node:crypto";

/**
 * Transient store for sandbox output artifacts (charts, exports). Code writes
 * files to its ephemeral workspace; the runner returns the bytes, the service
 * stashes them here, and the chat fetches them by id through a tenant-guarded
 * route. The bytes never enter the model context — the tool result carries only
 * { name, url }.
 *
 * In-memory + globalThis-pinned so it's a single instance across route bundles in
 * one Node process. Short TTL; ephemeral by design (matches the "no persistence"
 * decision). PROD CAVEAT: a multi-instance deploy needs a shared store (Redis/S3)
 * — the fetch could otherwise land on an instance that didn't create the artifact.
 */
export type SandboxArtifact = {
  bytes: Buffer;
  mime: string;
  name: string;
  companyId: string;
  userId: string;
  expiresAt: number;
};

const TTL_MS = 60 * 60 * 1000; // 1h
const MAX_ARTIFACTS = 500;

const globalRef = globalThis as unknown as { __sandboxArtifacts?: Map<string, SandboxArtifact> };
const store: Map<string, SandboxArtifact> = (globalRef.__sandboxArtifacts ??= new Map());

function sweep(): void {
  const now = Date.now();
  for (const [id, a] of store) if (now > a.expiresAt) store.delete(id);
  // Hard cap as a backstop against unbounded growth.
  if (store.size > MAX_ARTIFACTS) {
    const overflow = store.size - MAX_ARTIFACTS;
    let i = 0;
    for (const id of store.keys()) {
      if (i++ >= overflow) break;
      store.delete(id);
    }
  }
}

export function putArtifact(input: Omit<SandboxArtifact, "expiresAt">): string {
  sweep();
  const id = crypto.randomUUID();
  store.set(id, { ...input, expiresAt: Date.now() + TTL_MS });
  return id;
}

/** Returns the artifact only if it exists, is unexpired, and belongs to companyId. */
export function getArtifact(id: string, companyId: string): SandboxArtifact | null {
  const a = store.get(id);
  if (!a) return null;
  if (Date.now() > a.expiresAt) {
    store.delete(id);
    return null;
  }
  if (a.companyId !== companyId) return null;
  return a;
}
