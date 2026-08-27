export const AUTHORABLE_AI_CLIENT_IDENTITIES = {
  chatgpt: {
    name: "ChatGPT",
  },
  claude: {
    name: "Claude",
  },
  cursor: {
    name: "Cursor",
  },
  gemini: {
    name: "Gemini",
  },
} as const;

export type AuthorableAiClientIdentityId = keyof typeof AUTHORABLE_AI_CLIENT_IDENTITIES;
