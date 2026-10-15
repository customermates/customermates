export type FileContentSize = { size: number; parts: number };

export interface FileContentRepo {
  writePart(fileKey: string, part: number, data: Uint8Array): Promise<void>;
  readPart(fileKey: string, part: number): Promise<Uint8Array | null>;
  size(fileKey: string): Promise<FileContentSize | null>;
  deleteParts(fileKeys: string[]): Promise<void>;
}
