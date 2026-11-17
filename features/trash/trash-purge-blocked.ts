export class TrashPurgeBlockedError extends Error {
  constructor(
    message: string,
    readonly reasons: readonly string[],
    readonly waitsForTrash: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
