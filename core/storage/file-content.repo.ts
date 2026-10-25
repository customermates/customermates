export type FileContentSize = { size: number; parts: number };

export abstract class FileContentRepo {
  abstract writePart(fileKey: string, part: number, data: Uint8Array): Promise<void>;
  abstract readPart(fileKey: string, part: number): Promise<Uint8Array | null>;
  abstract size(fileKey: string): Promise<FileContentSize | null>;
  abstract deleteParts(fileKeys: string[]): Promise<void>;
}
