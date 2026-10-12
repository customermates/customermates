import { createHash } from "node:crypto";

import { canonicalRecordJson } from "./record-json";

export const recordRequestHash = (request: unknown) =>
  createHash("sha256").update(canonicalRecordJson(request)).digest("hex");
