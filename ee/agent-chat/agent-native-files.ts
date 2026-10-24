import type { RecordFileExtractionStatus } from "@/generated/prisma";

import { AGENT_CONTEXT_BYTES_PER_TOKEN } from "./agent-model";

export const AGENT_NATIVE_FILE_MAX_BYTES = 3 * 1024 * 1024;
export const AGENT_NATIVE_FILES_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const AGENT_NATIVE_PDF_MAX_PAGES = 3;
const AGENT_NATIVE_IMAGE_TOKENS = 1_600;
const AGENT_NATIVE_PDF_PAGE_TOKENS = 3_000;
export const AGENT_NATIVE_FILE_TOKEN_BUDGET = 12_000;

const NATIVE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const NATIVE_FILE_MODEL_PREFIX = "anthropic/claude-";

export type AgentTurnFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  extractionStatus: RecordFileExtractionStatus;
  pageCount: number | null;
};

export type AgentNativeFile = { fileId: string; mediaType: string; name: string; data?: string };

export function agentNativeFileTypes(modelId: string): readonly string[] {
  return modelId.startsWith(NATIVE_FILE_MODEL_PREFIX) ? [...NATIVE_IMAGE_TYPES, "application/pdf"] : [];
}

export function agentNativeFileTokens(mediaType: string): number {
  return mediaType === "application/pdf"
    ? AGENT_NATIVE_PDF_MAX_PAGES * AGENT_NATIVE_PDF_PAGE_TOKENS
    : AGENT_NATIVE_IMAGE_TOKENS;
}

export function agentNativeFileContextBytes(mediaType: string): number {
  return agentNativeFileTokens(mediaType) * AGENT_CONTEXT_BYTES_PER_TOKEN;
}

export function isAgentNativeFileEligible(file: AgentTurnFile, types: readonly string[]): boolean {
  if (!types.includes(file.mimeType) || file.size < 1 || file.size > AGENT_NATIVE_FILE_MAX_BYTES) return false;
  if (file.mimeType !== "application/pdf") return true;
  return file.pageCount !== null && file.pageCount >= 1 && file.pageCount <= AGENT_NATIVE_PDF_MAX_PAGES;
}
