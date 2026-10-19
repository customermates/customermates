import type { CreateRecordFileUploadResult, RecordFileDto } from "@/features/record-files/record-file.schema";

import { isWorkspaceChangedFailure } from "@/core/errors/workspace-changed";
import { notifyWorkspaceChanged } from "@/core/errors/workspace-changed-notice";

export type RecordFileRequest<T> = { ok: true; data: T } | { ok: false; message: string | null };

export type RecordFileUploadStart = RecordFileRequest<CreateRecordFileUploadResult>;

export type RecordFileTransfer = {
  done: Promise<{ ok: true } | { ok: false; message: string | null; aborted: boolean }>;
  abort: () => void;
};

function failureMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const issues = (body as { error?: { issues?: Array<{ message?: unknown }> } }).error?.issues;
  const message = issues?.[0]?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

function workspaceChanged(status: number, body: unknown) {
  if (status !== 409 || !isWorkspaceChangedFailure(body)) return false;
  notifyWorkspaceChanged();
  return true;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function postRecordFileRequest<T>(url: string, input: unknown): Promise<RecordFileRequest<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = parsed(await response.text());
  if (response.ok) return { ok: true, data: body as T };
  return { ok: false, message: workspaceChanged(response.status, body) ? null : failureMessage(body) };
}

export function startRecordFileUpload(input: { typeId: string; fieldId: string; file: File }) {
  return postRecordFileRequest<CreateRecordFileUploadResult>("/api/v1/files/uploads", {
    typeId: input.typeId,
    fieldId: input.fieldId,
    name: input.file.name,
    size: input.file.size,
    mimeType: input.file.type,
  });
}

export function startChatFileUpload(file: File) {
  return postRecordFileRequest<CreateRecordFileUploadResult>("/api/agent/files", {
    name: file.name,
    size: file.size,
    mimeType: file.type,
  });
}

export function completeChatFileUpload(fileId: string) {
  return postRecordFileRequest<RecordFileDto>(`/api/agent/files/${encodeURIComponent(fileId)}/complete`, {});
}

export function sendRecordFileBytes(
  upload: CreateRecordFileUploadResult["upload"],
  file: File,
  onProgress: (loaded: number, total: number) => void,
): RecordFileTransfer {
  const request = new XMLHttpRequest();
  const done = new Promise<{ ok: true } | { ok: false; message: string | null; aborted: boolean }>((resolve) => {
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve({ ok: true });
      const body = parsed(request.responseText);
      resolve({
        ok: false,
        message: workspaceChanged(request.status, body) ? null : failureMessage(body),
        aborted: false,
      });
    };
    request.onerror = () => resolve({ ok: false, message: null, aborted: false });
    request.onabort = () => resolve({ ok: false, message: null, aborted: true });
    request.send(file);
  });
  return { done, abort: () => request.abort() };
}
