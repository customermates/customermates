import type { NextRequest } from "next/server";
import type { z } from "zod";
import type { AgentRunnerRequest } from "@/features/agent-runners/agent-runner.schema";

import { NextResponse } from "next/server";

import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { InvalidJsonBodyError } from "@/core/errors/app-errors";
import { visitorKey } from "@/core/network/visitor-key";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";

class RunnerBodyTooLargeError extends Error {}

const BODY_TOO_LARGE = {
  error: {
    kind: "validation",
    issues: [{ code: "custom", path: [], message: "The request body is too large." }],
  },
};

async function readCappedText(request: NextRequest): Promise<string> {
  const limit = AGENT_RUNNER_LIMITS.maxBodyBytes;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) throw new RunnerBodyTooLargeError();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RunnerBodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(request: NextRequest): Promise<unknown> {
  const text = await readCappedText(request);
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidJsonBodyError();
  }
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: z.ZodError };

export async function runnerRequest<T>(
  request: NextRequest,
  invoke: (input: AgentRunnerRequest) => Promise<Outcome<T>>,
  respond: (data: T) => NextResponse = (data) => NextResponse.json(data),
): Promise<NextResponse> {
  try {
    const result = await invoke({
      authorization: request.headers.get("authorization"),
      visitor: await visitorKey({ headers: request.headers }),
      readBody: () => readJson(request),
      signal: request.signal,
    });
    if (!result.ok) return interactorFailureResponse(result.error);
    return respond(result.data);
  } catch (error) {
    if (error instanceof RunnerBodyTooLargeError) return NextResponse.json(BODY_TOO_LARGE, { status: 413 });
    return handleError(error);
  }
}
