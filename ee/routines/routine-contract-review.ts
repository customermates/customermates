import { RETIRED_RECORD_TOOLS } from "@/features/mcp-tools/retired-record-tools";

export function routineContractReview(prompt: string): string[] {
  const tools = Object.keys(RETIRED_RECORD_TOOLS).filter((name) => new RegExp(`\\b${name}\\b`, "i").test(prompt));
  const endpoints = [
    ...prompt.matchAll(
      /\/(?:api\/)?v1\/(?:contacts|organizations|deals|services|tasks|messaging\/activities\/search)(?:\/[\w{}:[\].-]+)*/gi,
    ),
  ].map((match) => match[0]);
  return [...new Set([...tools, ...endpoints])].sort();
}
