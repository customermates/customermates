import type { Request } from "@playwright/test";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ServerReferenceManifest = {
  node?: Record<string, { filename?: string; exportedName?: string }>;
};

function manifestPath() {
  const directory = process.env.CRM_E2E_SERVER_MODE === "development" ? ".next/dev/server" : ".next/server";
  return resolve(directory, "server-reference-manifest.json");
}

export function serverActionIds(filename: string, exportedName: string): ReadonlySet<string> {
  const manifest = JSON.parse(readFileSync(manifestPath(), "utf8")) as ServerReferenceManifest;
  const ids = Object.entries(manifest.node ?? {})
    .filter(([, action]) => action.filename === filename && action.exportedName === exportedName)
    .map(([id]) => id);
  if (ids.length === 0) throw new Error(`${exportedName} from ${filename} is not in the server action manifest.`);
  return new Set(ids);
}

export function invokesServerAction(request: Request, ids: ReadonlySet<string>) {
  const id = request.headers()["next-action"];
  return id !== undefined && ids.has(id);
}
