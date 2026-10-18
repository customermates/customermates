import { cleanEnvironment, run } from "./process.mjs";

export function databaseEnvironment(url, extra = {}) {
  return cleanEnvironment({ DATABASE_URL: url, DIRECT_URL: url, WORKFLOW_POSTGRES_URL: url, ...extra });
}

/**
 * Brings a fresh database to the state CI and the browser suite expect: every migration, the synthetic seed `seedTimes`
 * times (twice proves it converges) and the workflow store. Returns the failing step, if any, with its duration.
 */
export async function prepareDatabase(url, { seedTimes = 1, log, mode = "self-hosted", workflow = true } = {}) {
  const env = databaseEnvironment(url, { APP_MODE: mode });
  const steps = [
    ["migrate", "node_modules/.bin/prisma", ["migrate", "deploy"]],
    ...Array.from({ length: seedTimes }, (_, index) => [`seed ${index + 1}`, "node_modules/.bin/tsx", ["prisma/seed.ts"]]),
    ...(workflow ? [["workflow store", "node_modules/.bin/bootstrap", []]] : []),
  ];
  let total = 0;
  for (const [name, command, args] of steps) {
    const result = await run(command, args, { env, log });
    total += result.seconds;
    if (result.code !== 0) return { ok: false, failedStep: name, seconds: total };
  }
  return { ok: true, seconds: total };
}
