import "dotenv/config";

const { getReconcileRoutineRunsInteractor, getSweepDueRoutinesInteractor } = await import("@/core/di");

const swept = await getSweepDueRoutinesInteractor().invoke();
const reconciled = await getReconcileRoutineRunsInteractor().invoke();

process.stdout.write(`${JSON.stringify({ ...swept, ...reconciled })}\n`);
process.exit(0);
