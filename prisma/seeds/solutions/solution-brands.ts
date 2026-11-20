import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SolutionId } from "@/core/solutions/solution-catalog";
import type { PrismaClient } from "@/generated/prisma";

import type { SolutionWorkspace } from "./solution-workspaces";

export const SOLUTION_BRAND_DIRECTORY = fileURLToPath(new URL("./assets/brands/", import.meta.url));

/** The accent colour of each solution's business; its mark in `assets/brands/<solution>.svg` is drawn on the same colour. */
export const SOLUTION_BRAND_ACCENTS: Record<SolutionId, string> = {
  smb: "#0f766e",
  consultants: "#1e3a8a",
  agencies: "#be185d",
  freelancers: "#c2410c",
  startups: "#7c3aed",
  "client-management": "#78350f",
  "sales-pipeline": "#0369a1",
  "linkedin-crm": "#334155",
  "whatsapp-crm": "#4d7c0f",
};

export type SolutionBrand = { accentColor: string; logo: Uint8Array; logoType: "image/png"; logoKey: string };

const logos = new Map<SolutionId, { bytes: Uint8Array; digest: string }>();

function solutionLogo(id: SolutionId) {
  const cached = logos.get(id);
  if (cached) return cached;
  const bytes = new Uint8Array(readFileSync(join(SOLUTION_BRAND_DIRECTORY, `${id}.png`)));
  const logo = { bytes, digest: createHash("sha256").update(bytes).digest("hex").slice(0, 16) };
  logos.set(id, logo);
  return logo;
}

/**
 * The brand of a demo workspace: the mark and accent of its solution, shared by the six locale workspaces. The logo
 * key carries a digest of the image because the logo route caches a key forever.
 */
export function solutionBrand(workspace: Pick<SolutionWorkspace, "solution" | "locale">): SolutionBrand {
  const { id } = workspace.solution;
  const logo = solutionLogo(id);
  return {
    accentColor: SOLUTION_BRAND_ACCENTS[id],
    logo: logo.bytes,
    logoType: "image/png",
    logoKey: `demo-${id}-${workspace.locale}-${logo.digest}`,
  };
}

export async function seedSolutionBrand(
  prisma: Pick<PrismaClient, "companyBrand">,
  workspace: Pick<SolutionWorkspace, "companyId" | "solution" | "locale">,
) {
  const { companyId } = workspace;
  const brand = solutionBrand(workspace);
  const row = { ...brand, logo: new Uint8Array(brand.logo) };
  await prisma.companyBrand.upsert({ where: { companyId }, update: row, create: { companyId, ...row } });
}
