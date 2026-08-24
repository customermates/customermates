import { ChevronDown, Paperclip, Send, Smile } from "lucide-react";

import { SceneCursor, type CursorWaypoint } from "./scene-cursor";
import {
  SceneCaret,
  SceneFrame,
  SceneWindow,
  sceneAfter,
  sceneCaretVisible,
  sceneStream,
  type SceneBeats,
  type SceneProps,
} from "./scene-grammar";
import { Avatar, Button } from "./platform";

import { cn } from "@/core/utils/cn";

const LEON = { name: "Leon Becker", photo: "/demo/avatars/photos/leon-becker.png" };

const ME = { name: "Max Bergmann", photo: "/demo/avatars/photos/max-bergmann.png" };

const REPLY = "Great, Leon. I will share the migration checklist today and keep Thursday open.";

const THREAD = [
  {
    at: "09:31 AM",
    id: "m2",
    outbound: true,
    text: "Appreciate that, Leon. We try to get one useful workflow live quickly, then expand from evidence.",
  },
  {
    at: "10:02 AM",
    id: "m3",
    outbound: false,
    text: "I ran the checklist through internal review and it cleared the open questions.",
  },
];

export const CHAT_DRAFT_BEATS = {
  focus: [0.1, 0.12],
  typing: [0.12, 0.38],
  hold: [0.38, 0.52],
  reach: [0.52, 0.6],
  press: [0.6, 0.62],
  land: [0.62, 0.66],
  read: [0.66, 0.86],
  rewind: [0.86, 0.94],
} as const satisfies SceneBeats;

export const CHAT_DRAFT_DURATION_MS = 12_000;

export const CHAT_DRAFT_STILL_AT = 0.75;

const CURSOR_IDLE = { x: 30, y: 89.5 } as const;

const CURSOR_SEND = { x: 92.9, y: 95.4 } as const;

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.1, ...CURSOR_IDLE },
  { at: 0.115, holding: true, ...CURSOR_IDLE },
  { at: 0.12, ...CURSOR_IDLE },
  { at: 0.52, ...CURSOR_IDLE },
  { at: 0.6, ...CURSOR_SEND },
  { at: 0.62, holding: true, ...CURSOR_SEND },
  { at: 0.66, ...CURSOR_SEND },
  { at: 0.86, ...CURSOR_IDLE },
  { at: 1, ...CURSOR_IDLE },
];

function ramp(clock: number, [from, to]: readonly [number, number]) {
  if (clock <= from) return 0;
  if (clock >= to) return 1;
  return (clock - from) / (to - from);
}

function Message({
  at,
  name,
  outbound,
  photo,
  text,
}: {
  at: string;
  name: string;
  outbound: boolean;
  photo: string;
  text: string;
}) {
  return (
    <div className={cn("flex gap-2 px-4 py-2", outbound ? "flex-row-reverse" : "flex-row")}>
      <span className="shrink-0 self-end rounded-lg">
        <Avatar name={name} size="lg" src={photo} />
      </span>

      <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-1", outbound ? "items-end" : "items-start")}>
        <div
          className={cn(
            "flex w-fit max-w-full flex-col overflow-hidden rounded-xl bg-card text-sm shadow-xs",
            outbound ? "rounded-br-md" : "rounded-bl-md",
          )}
        >
          <div className="px-3.5 pt-2 pb-1 leading-relaxed wrap-anywhere">{text}</div>
        </div>

        <div className="flex items-center gap-1.5 px-1">
          {outbound ? null : <span className="max-w-48 truncate text-xs font-medium text-foreground/80">{name}</span>}

          <span className="text-[11px] whitespace-nowrap text-muted-foreground">{at}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatDraftScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : CHAT_DRAFT_STILL_AT;

  const typed = sceneStream(REPLY, clock, CHAT_DRAFT_BEATS.typing);
  const sent = sceneAfter(clock, CHAT_DRAFT_BEATS.land[0]) && !sceneAfter(clock, CHAT_DRAFT_BEATS.rewind[1]);
  const composed = sceneAfter(clock, CHAT_DRAFT_BEATS.land[0]) ? { typing: false, visible: "" } : typed;
  const postedOpacity = sent ? ramp(clock, CHAT_DRAFT_BEATS.land) * (1 - ramp(clock, CHAT_DRAFT_BEATS.rewind)) : 0;
  const focused = sceneAfter(clock, CHAT_DRAFT_BEATS.focus[0]) && !sceneAfter(clock, CHAT_DRAFT_BEATS.land[0]);

  return (
    <SceneFrame className={className} crop="none" film={film} label={label}>
      <SceneWindow fill={film} title="Inbox · Leon Becker">
        <div className={cn("flex flex-col", film && "min-h-0 flex-1")}>
          <div className="flex min-h-0 flex-1 flex-col py-3">
            <div className="flex flex-col gap-1">
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full bg-background">
                  <span className="block w-28 rounded-full border border-border bg-muted py-0.5 text-center text-xs font-medium text-muted-foreground">
                    Today
                  </span>
                </span>
              </div>

              {THREAD.map((message) => (
                <Message
                  key={message.id}
                  at={message.at}
                  name={message.outbound ? ME.name : LEON.name}
                  outbound={message.outbound}
                  photo={message.outbound ? ME.photo : LEON.photo}
                  text={message.text}
                />
              ))}

              {sent ? (
                <div style={{ opacity: postedOpacity }}>
                  <Message outbound at="10:07 AM" name={ME.name} photo={ME.photo} text={REPLY} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 bg-background px-4 pt-2 pb-4">
            <div
              className={cn(
                "flex flex-col rounded-xl border border-input bg-input-background shadow-xs",
                focused && "ring-[3px] ring-ring/50 ring-inset",
              )}
            >
              <div className="min-h-[56px] px-3 pt-2.5 text-sm whitespace-pre-wrap">
                {composed.visible ? (
                  <>
                    <span>{composed.visible}</span>

                    <SceneCaret visible={sceneCaretVisible(clock, CHAT_DRAFT_DURATION_MS)} />
                  </>
                ) : (
                  <span className="text-muted-foreground">Type a message...</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-2 pt-0.5 pb-1.5">
                <div className="flex items-center gap-0.5">
                  <Button aria-label="Attach files" size="icon-sm" variant="secondary">
                    <Paperclip className="size-4" />
                  </Button>

                  <Button aria-label="Insert emoji" size="icon-sm" variant="secondary">
                    <Smile className="size-4" />
                  </Button>
                </div>

                <div className="flex items-stretch">
                  <Button className="rounded-r-none pr-2.5" size="sm">
                    <Send className="size-4" />
                    Send
                  </Button>

                  <Button
                    aria-label="More send options"
                    className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
                    size="sm"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SceneWindow>

      <SceneCursor path={CURSOR_PATH} t={t} />
    </SceneFrame>
  );
}
