import type { FileStorageDriver } from "./file-storage-driver";

export type FileStorageDrivers = (name: string) => FileStorageDriver;
