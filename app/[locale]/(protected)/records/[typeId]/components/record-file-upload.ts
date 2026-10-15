import type { CreateRecordFileUploadResult } from "@/features/record-files/record-file.schema";

export type RecordFileUploadStart =
  | { ok: true; data: CreateRecordFileUploadResult }
  | { ok: false; message: string | null };

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

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function startRecordFileUpload(input: {
  typeId: string;
  fieldId: string;
  file: File;
}): Promise<RecordFileUploadStart> {
  const response = await fetch("/api/v1/files/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      typeId: input.typeId,
      fieldId: input.fieldId,
      name: input.file.name,
      size: input.file.size,
      mimeType: input.file.type,
    }),
  });
  const body = parsed(await response.text());
  return response.ok
    ? { ok: true, data: body as CreateRecordFileUploadResult }
    : { ok: false, message: failureMessage(body) };
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
    request.onload = () =>
      resolve(
        request.status >= 200 && request.status < 300
          ? { ok: true }
          : { ok: false, message: failureMessage(parsed(request.responseText)), aborted: false },
      );
    request.onerror = () => resolve({ ok: false, message: null, aborted: false });
    request.onabort = () => resolve({ ok: false, message: null, aborted: true });
    request.send(file);
  });
  return { done, abort: () => request.abort() };
}
