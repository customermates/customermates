import "server-only";

import type { P13nEntry } from "../prisma-p13n.repository";

import { getGetP13nInteractor } from "@/core/di";
import { reportApplicationError } from "@/core/errors/report-application-error";

export async function getOptionalP13n(p13nId: string): Promise<P13nEntry | null> {
  try {
    const result = await getGetP13nInteractor().invoke({ p13nId });
    return result.ok ? (result.data ?? null) : null;
  } catch (error) {
    reportApplicationError(error);
    return null;
  }
}
