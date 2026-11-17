import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getClaimAgentJobInteractor } from "@/core/di";

import { runnerRequest } from "../../runner-request";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function POST(request: NextRequest) {
  return runnerRequest(
    request,
    (input) => getClaimAgentJobInteractor().invoke(input),
    (data) => (data === null ? new NextResponse(null, { status: 204 }) : NextResponse.json(data)),
  );
}
