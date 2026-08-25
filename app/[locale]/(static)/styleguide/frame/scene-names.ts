export const SCENE_NAMES = ["chat-draft", "dashboard", "pipeline", "unified-inbox"] as const;

export type SceneName = (typeof SCENE_NAMES)[number];

export function resolveSceneName(value: string | undefined): SceneName {
  return SCENE_NAMES.includes(value as SceneName) ? (value as SceneName) : "chat-draft";
}
