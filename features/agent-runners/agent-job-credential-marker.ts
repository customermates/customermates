import { z } from "zod";

const MarkerSchema = z.object({
  agentJob: z.object({ jobId: z.uuid(), attempt: z.number().int().min(1), runnerId: z.uuid() }),
});

export type AgentJobCredentialMarker = z.infer<typeof MarkerSchema>["agentJob"];

export function agentJobKeyName(jobId: string, attempt: number): string {
  return `Runner job ${jobId} #${attempt}`;
}

export function agentJobCredentialMetadata(marker: AgentJobCredentialMarker): string {
  return JSON.stringify({ agentJob: marker });
}

export function parseAgentJobCredentialMetadata(metadata: unknown): AgentJobCredentialMarker | null {
  let value: unknown = metadata;
  for (let depth = 0; depth < 2 && typeof value === "string"; depth += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = MarkerSchema.safeParse(value);
  return parsed.success ? parsed.data.agentJob : null;
}
