import type { NextRequest } from "next/server";

import { getHeartbeatAgentRunnerInteractor } from "@/core/di";

import { runnerRequest } from "../runner-request";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return runnerRequest(request, (input) => getHeartbeatAgentRunnerInteractor().invoke(input));
}
