import { createHash } from "node:crypto";

export function deterministicId(companyId: string, key: string): string {
  const hash = createHash("sha256").update(`customermates:records:v2:${companyId}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
