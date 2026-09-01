import type { WorkflowTenant } from "./workflow-tenant";
import type { RoutineWriteTarget } from "@/ee/routines/routine-graph";

import { generateObject } from "ai";
import { z } from "zod";

import { getRecordRoutineRiskFindingsInteractor, getRoutineRepo } from "@/core/di";
import { MODEL_CATALOG } from "@/ee/agent-chat/model-catalog";
import { ROUTINE_WRITE_TARGETS, detectRoutineLoops } from "@/ee/routines/routine-graph";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "analyze-routine-loops";
const ANALYZER_MODEL = MODEL_CATALOG.fast;

export type AnalyzeRoutineLoopsWorkflowPayload = {
  companyId: string;
  tenant?: WorkflowTenant;
};

type RoutineUnderAnalysis = { id: string; name: string; prompt: string; triggerEvents: string[] };

type WritePrediction = { writes: RoutineWriteTarget[]; confidence: string };

const PredictionSchema = z.object({
  writes: z.array(z.enum(ROUTINE_WRITE_TARGETS)),
  confidence: z.enum(["low", "medium", "high"]),
});

async function loadRoutinesForAnalysis(companyId: string): Promise<RoutineUnderAnalysis[]> {
  "use step";
  return getRoutineRepo().findRoutinesForAnalysisUnscoped(companyId);
}

async function predictRoutineWrites(routine: RoutineUnderAnalysis): Promise<WritePrediction> {
  "use step";
  const { object } = await generateObject({
    model: ANALYZER_MODEL.modelId,
    providerOptions: { gateway: { only: [ANALYZER_MODEL.servingProvider] } },
    schema: PredictionSchema,
    system:
      "You classify what a saved automation instruction will change in a CRM. Answer only with the record types the instruction would create, update or delete. An instruction that merely reads or summarises writes nothing.",
    prompt: `Instruction:\n${routine.prompt}`,
  });

  return { writes: [...object.writes], confidence: object.confidence };
}
predictRoutineWrites.maxRetries = 1;

async function recordFindings(
  companyId: string,
  routines: RoutineUnderAnalysis[],
  predictions: WritePrediction[],
): Promise<void> {
  "use step";
  const loops = detectRoutineLoops(
    routines.map((routine, index) => ({
      id: routine.id,
      name: routine.name,
      triggerEvents: routine.triggerEvents,
      writes: predictions[index]?.writes ?? [],
    })),
  );

  await getRecordRoutineRiskFindingsInteractor().invoke({
    companyId,
    findings: loops.map((loop) => ({
      routineId: loop.routineId,
      peerRoutineId: loop.kind === "mutualLoop" ? loop.peerRoutineId : null,
      kind: loop.kind,
      triggerEvent: loop.event,
      confidence: predictions[routines.findIndex((routine) => routine.id === loop.routineId)]?.confidence ?? "low",
    })),
  });
}

export async function analyzeRoutineLoops(payload: AnalyzeRoutineLoopsWorkflowPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  try {
    const routines = await loadRoutinesForAnalysis(payload.companyId);
    if (routines.length === 0) return;

    const predictions: WritePrediction[] = [];
    for (const routine of routines) predictions.push(await predictRoutineWrites(routine));

    await recordFindings(payload.companyId, routines, predictions);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    throw err;
  }
}
