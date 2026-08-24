import { SceneCursor, type CursorWaypoint } from "./scene-cursor";
import { cn } from "@/core/utils/cn";
import {
  SceneBubble,
  SceneCaret,
  SceneFrame,
  SceneWindow,
  sceneAfter,
  sceneCaretVisible,
  sceneStream,
  sceneUnstream,
  type SceneBeats,
  type SceneProps,
} from "./scene-grammar";

const INBOUND = "Can you send over the updated quote for the two extra seats?";

const DRAFT = "Happy to. The revised quote for two additional seats is attached, valid for 30 days.";

export const CHAT_DRAFT_BEATS = {
  typing: [0.12, 0.38],
  waiting: [0.38, 0.62],
  sent: [0.66, 0.78],
  reset: [0.82, 0.96],
} as const satisfies SceneBeats;

export const CHAT_DRAFT_DURATION_MS = 12_000;

export const CHAT_DRAFT_STILL_AT = 0.5;

const CURSOR_IDLE = { x: 24, y: 76 } as const;

const CURSOR_SEND = { x: 91.4, y: 91.4 } as const;

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.56, ...CURSOR_IDLE },
  { at: 0.645, ...CURSOR_SEND },
  { at: 0.66, holding: true, ...CURSOR_SEND },
  { at: 0.7, ...CURSOR_SEND },
  { at: 0.8, ...CURSOR_IDLE },
  { at: 1, ...CURSOR_IDLE },
];

export function ChatDraftScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : CHAT_DRAFT_STILL_AT;

  const typed = sceneStream(DRAFT, clock, CHAT_DRAFT_BEATS.typing);
  const retracted = sceneUnstream(DRAFT, clock, CHAT_DRAFT_BEATS.reset);
  const resetting = sceneAfter(clock, CHAT_DRAFT_BEATS.reset[0]);
  const draft = resetting ? retracted : typed;
  const sent = sceneAfter(clock, CHAT_DRAFT_BEATS.sent[0]) && draft.visible.length > 0;
  const waiting = draft.visible.length > 0 && !draft.typing;

  return (
    <SceneFrame className={className} crop="none" film={film} label={label}>
      <SceneCursor path={CURSOR_PATH} t={t} />

      <SceneWindow fill={film} title="Inbox · Maria Feldmann">
        <div className={cn("flex flex-col gap-[1.8cqw] p-[2.4cqw]", film && "min-h-0 flex-1")}>
          <SceneBubble>{INBOUND}</SceneBubble>

          <div style={{ opacity: draft.visible ? 1 : 0 }}>
            <SceneBubble from={sent ? "mine" : "draft"}>
              {draft.visible}

              {draft.typing ? <SceneCaret visible={sceneCaretVisible(clock, CHAT_DRAFT_DURATION_MS)} /> : null}
            </SceneBubble>
          </div>

          <div className="mt-auto flex items-center justify-between gap-[2cqw] rounded-card border border-border bg-muted px-[2cqw] py-[1.6cqw]">
            <span className="scene-meta text-muted-foreground">
              {sent ? "Sent by you" : waiting ? "Draft waiting for you" : "Drafting"}
            </span>

            <span
              className={
                sent
                  ? "scene-meta rounded-full bg-success px-[2cqw] py-[0.9cqw] font-medium text-success-foreground"
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
