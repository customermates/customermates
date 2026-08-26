export const SCENE_NAMES = [
  "agent-pipeline",
  "chat-draft",
  "dashboard",
  "dashboard-insight",
  "pipeline",
  "unified-inbox",
] as const;

export type SceneName = (typeof SCENE_NAMES)[number];

export function resolveSceneName(value: string | undefined): SceneName | null {
  return SCENE_NAMES.includes(value as SceneName) ? (value as SceneName) : null;
}
