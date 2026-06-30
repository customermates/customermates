import crypto from "node:crypto";

/**
 * Transient store for files the USER uploads into a chat conversation (the inbound
 * counterpart to artifact-store). The drawer POSTs each file here; the bytes are
 * held tenant-scoped and fetched back by id through a session-guarded route. They
 * feed two consumers, both server-side: (1) image/PDF uploads are hydrated into the
 * model's content for vision; (2) any file can be seeded into the `run_code`
 * workspace. The bytes never enter the model context as text — only names/urls do.
 *
 * In-memory + globalThis-pinned (single instance across route bundles in one Node
 * process). Ephemeral by design — matches the sandbox's "no persistence" posture —
 * but with a longer TTL than output artifacts, since an upload is user intent that
 * may span several turns. PROD CAVEAT: a multi-instance deploy needs a shared store
 * (Redis/S3); otherwise (a) a fetch/run can land on an instance that lacks the bytes,
 * and (b) the per-company/global quotas below are enforced PER INSTANCE, so N replicas
 * multiply them by N. Both are resolved by moving the store to Redis/S3.
 */
export type SandboxUpload = {
  bytes: Buffer;
  mime: string;
  name: string;
  companyId: string;
  userId: string;
  expiresAt: number;
};

/** Hard per-file ceiling. Also enforced client-side; this is the server backstop. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
/** Max simultaneously-live uploads per company (abuse / memory backstop). */
export const MAX_UPLOADS_PER_COMPANY = 50;
/**
 * Max aggregate live upload bytes per company. The count cap alone lets one tenant
 * pin ~1.25 GB (50 × 25 MB) on the shared heap; this bounds the actual memory.
 * NOTE: like the count cap, this is PER-INSTANCE — a multi-replica deploy multiplies
 * it by N and needs a shared store (Redis/S3) to enforce globally (see header).
 */
export const MAX_BYTES_PER_COMPANY = 100 * 1024 * 1024; // 100 MB

const TTL_MS = 24 * 60 * 60 * 1000; // 24h — outlives a single run/turn, unlike artifacts (1h)
const MAX_UPLOADS = 2_000; // global backstop against unbounded growth

const globalRef = globalThis as unknown as { __sandboxUploads?: Map<string, SandboxUpload> };
const store: Map<string, SandboxUpload> = (globalRef.__sandboxUploads ??= new Map());

function sweep(): void {
  const now = Date.now();
  for (const [id, u] of store) if (now > u.expiresAt) store.delete(id);
  if (store.size > MAX_UPLOADS) {
    const overflow = store.size - MAX_UPLOADS;
    let i = 0;
    for (const id of store.keys()) {
      if (i++ >= overflow) break;
      store.delete(id);
    }
  }
}

export function putUpload(input: Omit<SandboxUpload, "expiresAt">): string {
  sweep();
  const id = crypto.randomUUID();
  store.set(id, { ...input, expiresAt: Date.now() + TTL_MS });
  return id;
}

/** Returns the upload only if it exists, is unexpired, and belongs to companyId. */
export function getUpload(id: string, companyId: string): SandboxUpload | null {
  const u = store.get(id);
  if (!u) return null;
  if (Date.now() > u.expiresAt) {
    store.delete(id);
    return null;
  }
  if (u.companyId !== companyId) return null;
  return u;
}

/** Drop an upload (best-effort, tenant-checked) — e.g. the user removed the chip. */
export function deleteUpload(id: string, companyId: string): void {
  const u = store.get(id);
  if (u && u.companyId === companyId) store.delete(id);
}

/** Live count + aggregate bytes for a company. Sweeps eagerly so idle expiry counts. */
export function companyUsage(companyId: string): { count: number; bytes: number } {
  sweep();
  let count = 0;
  let bytes = 0;
  for (const u of store.values()) {
    if (u.companyId !== companyId) continue;
    count++;
    bytes += u.bytes.length;
  }
  return { count, bytes };
}

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  xml: "application/xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  parquet: "application/vnd.apache.parquet",
};

/** Best-effort MIME from a filename when the browser supplies none. */
export function guessMime(name: string): string {
  return EXT_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
