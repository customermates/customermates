const SKEW_MESSAGES = ["was not found on the server", "Failed to find Server Action"];
const CHUNK_LOAD_MESSAGE = /^(Loading (CSS )?chunk \S+ failed|Failed to load chunk )/;

export function isDeploymentSkewError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "UnrecognizedActionError" || name === "ChunkLoadError") return true;
  if (typeof message !== "string") return false;
  if (CHUNK_LOAD_MESSAGE.test(message)) return true;
  if (isMissingModuleInRuntime(message, (error as { stack?: unknown }).stack)) return true;
  return message.includes("Server Action") && SKEW_MESSAGES.some((m) => message.includes(m));
}

// The webpack runtime of a tab opened on an earlier deployment loads a chunk of the current one and finds
// no factory for a module id it expects. Only a TypeError thrown by the runtime itself counts.
const MISSING_MODULE_MESSAGE =
  /^(Cannot read properties of undefined \(reading 'call'\)|undefined is not an object \(evaluating '[\w$]+\[[\w$]+\]\.call'\)|[\w$]+\[[\w$]+\] is undefined)$/;
const WEBPACK_RUNTIME = /\/_next\/static\/chunks\/webpack-[0-9a-f]+\.js/;

function isMissingModuleInRuntime(message: string, stack: unknown): boolean {
  if (!MISSING_MODULE_MESSAGE.test(message) || typeof stack !== "string") return false;
  const firstFrame = stack.split("\n").find((line) => /^\s*at |@/.test(line));
  return firstFrame !== undefined && WEBPACK_RUNTIME.test(firstFrame);
}
