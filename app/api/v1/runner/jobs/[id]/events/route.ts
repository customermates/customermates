import type { NextRequest } from "next/server";

import { getAppendAgentJobEventsInteractor } from "@/core/di";

import { runnerRequest } from "../../../runner-request";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runnerRequest(request, (input) => getAppendAgentJobEventsInteractor().invoke({ ...input, jobId: id }));
}
