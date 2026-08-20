type ApplicationErrorHandler = (error: unknown) => void;

let activeHandler: ApplicationErrorHandler | null = null;

export function registerApplicationErrorHandler(handler: ApplicationErrorHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function reportApplicationError(error: unknown): void {
  activeHandler?.(error);
}
