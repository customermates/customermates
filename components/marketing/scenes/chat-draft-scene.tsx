import {
  SceneBubble,
  SceneCaret,
  SceneFrame,
  SceneWindow,
  sceneAfter,
  sceneCaretVisible,
  sceneStream,
  type SceneBeats,
  type SceneProps,
} from "./scene-grammar";

const INBOUND = "Can you send over the updated quote for the two extra seats?";

const DRAFT = "Happy to. The revised quote for two additional seats is attached, valid for 30 days.";

export const CHAT_DRAFT_BEATS = {
  inbound: [0.02, 0.1],
  typing: [0.14, 0.46],
  waiting: [0.46, 0.8],
  sent: [0.8, 1],
} as const satisfies SceneBeats;

export const CHAT_DRAFT_DURATION_MS = 11_000;

export const CHAT_DRAFT_STILL_AT = 0.6;

export function ChatDraftScene({ className, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : CHAT_DRAFT_STILL_AT;

  const inbound = sceneAfter(clock, CHAT_DRAFT_BEATS.inbound[0]);
  const draft = sceneStream(DRAFT, clock, CHAT_DRAFT_BEATS.typing);
  const sent = sceneAfter(clock, CHAT_DRAFT_BEATS.sent[0]);

  return (
    <SceneFrame className={className} crop="none" label={label}>
      <SceneWindow title="Inbox · Maria Feldmann">
        <div className="flex flex-col gap-[1.8cqw] p-[2.4cqw]">
          <div style={{ opacity: inbound ? 1 : 0 }}>
            <SceneBubble>{INBOUND}</SceneBubble>
          </div>

          <div style={{ opacity: draft.visible ? 1 : 0 }}>
            <SceneBubble from="draft">
              {draft.visible}

              {draft.typing ? <SceneCaret visible={sceneCaretVisible(clock, CHAT_DRAFT_DURATION_MS)} /> : null}
            </SceneBubble>
          </div>

          <div className="mt-[0.8cqw] flex items-center justify-between gap-[2cqw] rounded-card border border-border bg-muted px-[2cqw] py-[1.6cqw]">
            <span className="scene-meta text-muted-foreground">
              {sent ? "Sent by you" : draft.done ? "Draft waiting for you" : "Drafting"}
            </span>

            <span
              className={
                sent
                  ? "scene-meta rounded-full bg-success px-[2cqw] py-[0.9cqw] font-medium text-primary-foreground"
                  : "scene-meta rounded-full bg-primary px-[2cqw] py-[0.9cqw] font-medium text-primary-foreground"
              }
            >
              {sent ? "Sent" : "Send"}
            </span>
          </div>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
