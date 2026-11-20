import type { ClientName } from "../types.js";
import type { ClientAdapter } from "./adapter.js";

import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { geminiAdapter } from "./gemini.js";

export const CLIENT_ADAPTERS: Record<ClientName, ClientAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
};
