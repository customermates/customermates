export type AttachmentInput = { filename: string; content_type: string; content: string };

export const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export async function toAttachmentInput(file: File): Promise<AttachmentInput> {
  return {
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    content: await fileToBase64(file),
  };
}
