import type { RecordFileExtractionStatus } from "@/features/records/record-file-upload.repo";

import { AGENT_CONTEXT_BYTES_PER_TOKEN } from "./agent-model";

export const AGENT_NATIVE_FILE_MAX_BYTES = 3 * 1024 * 1024;
export const AGENT_NATIVE_FILES_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const AGENT_NATIVE_PDF_MAX_PAGES = 3;
export const AGENT_NATIVE_IMAGE_TOKENS = 1_600;
export const AGENT_NATIVE_PDF_PAGE_TOKENS = 3_000;
export const AGENT_NATIVE_FILE_TOKEN_BUDGET = 12_000;

const NATIVE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const NATIVE_FILE_MODEL_PREFIXES = ["google/gemini-", "anthropic/claude-"] as const;

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
  return NATIVE_FILE_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix))
    ? [...NATIVE_IMAGE_TYPES, "application/pdf"]
    : [];
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
