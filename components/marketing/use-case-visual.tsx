import type { UseCaseVisual as UseCaseVisualKind } from "@/core/fumadocs/schemas/use-cases";
import type { ReactNode } from "react";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  FileText,
  Plug,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Google, Linkedin, Whatsapp } from "@/components/icons/channel-icon";
import { cn } from "@/core/utils/cn";

function Line({ className }: { className?: string }) {
  return <span aria-hidden className={cn("mk-mini-line", className)} />;
}

function Window({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mk-mini-window", className)}>{children}</div>;
}

function MateMark() {
  return (
    <span aria-hidden className="mk-mini-mate">
      <Sparkles className="size-2.5" />
    </span>
  );
}

function Row({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <div className="mk-mini-row" data-active={active || undefined}>
      {children}
    </div>
  );
}

function Conversation() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Linkedin className="mk-mini-brand size-3.5" size={14} />

        <Line className="w-16" />
      </div>

      <div className="grid gap-1.5 p-2.5">
        <div className="mk-mini-bubble w-[72%]">
          <Line className="w-full" />

          <Line className="w-3/5" />
        </div>

        <div className="mk-mini-bubble mk-mini-draft ml-auto w-[78%]">
          <span className="flex items-center gap-1.5">
            <MateMark />

            <Line className="w-10" />
          </span>

          <span className="flex items-center justify-between gap-2">
            <Line className="w-3/5" />

            <span className="mk-mini-button" />
          </span>
        </div>
      </div>
    </Window>
  );
}

function Proposal() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="mk-mini-avatar" />

          <Line className="w-20" />
        </span>

        <span className="mk-mini-pill">
          <Line className="w-8" />
        </span>
      </div>

      <div className="mk-mini-steps px-3 pt-3">
        {[0, 1, 2, 3].map((step) => (
          <span
            key={step}
            className="mk-mini-step"
            data-current={step === 2 || undefined}
            data-done={step < 2 || undefined}
          />
        ))}
      </div>

      <div className="p-3">
        <Row active>
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-foreground" />

          <Line className="w-24" />

          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <CalendarDays aria-hidden className="size-3" />

            <Line className="w-6" />
          </span>
        </Row>
      </div>
    </Window>
  );
}

function Dashboard() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center justify-between px-3 pt-3">
        <Line className="w-20" />

        <Line className="w-8" />
      </div>

      <div className="grid gap-1.5 p-3">
        {[true, false, false].map((overdue, index) => (
          <Row key={index} active={index === 0}>
            <span className="mk-mini-date">
              <Line className="w-3" />
            </span>

            <span className="grid flex-1 gap-1">
              <Line className={index === 1 ? "w-3/4" : "w-full"} />

              <Line className="mk-mini-line-faint w-1/2" />
            </span>

            {overdue ? (
              <span aria-hidden className="mk-mini-dot" />
            ) : (
              <Circle aria-hidden className="size-3 text-muted-foreground" />
            )}
          </Row>
        ))}
      </div>
    </Window>
  );
}

function Agent() {
  return (
    <div className="flex w-[86%] items-center gap-3">
      <div className="grid gap-2">
        {(["claude", "chatgpt", "cursor"] as const).map((provider) => (
          <span key={provider} className="mk-mini-tile">
            <AiClientLogo className="mk-mini-brand size-4" provider={provider} />
          </span>
        ))}
      </div>

      <span className="flex flex-1 items-center text-muted-foreground">
        <span aria-hidden className="mk-mini-wire" />

        <span className="mk-mini-pill mx-1 shrink-0 text-foreground">
          <Plug aria-hidden className="size-3" />
        </span>

        <span aria-hidden className="mk-mini-wire" />

        <ArrowRight aria-hidden className="-ml-1 size-3 shrink-0" />
      </span>

      <Window className="w-[46%] shrink-0">
        <div className="grid gap-1.5 p-2.5">
          {[0, 1, 2].map((row) => (
            <Row key={row} active={row === 1}>
              <span aria-hidden className="mk-mini-avatar size-3" />

              <Line className={row === 1 ? "w-full" : "w-3/4"} />
            </Row>
          ))}
        </div>
      </Window>
    </div>
  );
}

function Inbox() {
  const channels = [
    <Linkedin key="linkedin" className="mk-mini-brand size-3.5" size={14} />,
    <Google key="mail" className="mk-mini-brand size-3.5" size={14} />,
    <Whatsapp key="whatsapp" className="mk-mini-brand size-3.5" size={14} />,
  ];

  return (
    <Window className="w-[86%]">
      <div className="grid gap-1.5 p-3">
        {channels.map((icon, index) => (
          <Row key={index} active={index === 0}>
            {icon}

            <span className="grid flex-1 gap-1">
              <Line className={index === 2 ? "w-2/3" : "w-4/5"} />

              <Line className="mk-mini-line-faint w-full" />
            </span>

            {index === 0 ? <span aria-hidden className="mk-mini-dot" /> : null}
          </Row>
        ))}
      </div>
    </Window>
  );
}

function Team() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Google className="mk-mini-brand size-3.5" size={14} />

        <Line className="w-16" />

        <span className="ml-auto flex -space-x-1.5">
          {["A", "L", "M"].map((initial) => (
            <span
              key={initial}
              aria-hidden
              className="mk-mini-avatar grid place-items-center text-[0.5rem] font-semibold"
            >
              {initial}
            </span>
          ))}
        </span>
      </div>

      <div className="grid gap-1.5 p-2.5">
        <div className="mk-mini-bubble w-[70%]">
          <Line className="w-full" />

          <Line className="w-1/2" />
        </div>

        <div className="mk-mini-bubble mk-mini-draft ml-auto w-[64%]">
          <span className="flex items-center gap-1.5">
            <UsersRound aria-hidden className="size-3 text-muted-foreground" />

            <Line className="w-10" />
          </span>

          <Line className="w-full" />
        </div>
      </div>
    </Window>
  );
}

function Pipeline() {
  const columns = [3, 2, 1];

  return (
    <div className="grid w-[86%] grid-cols-3 gap-2">
      {columns.map((cards, column) => (
        <div key={column} className="mk-mini-column">
          <Line className="mb-1 w-2/3" />

          {Array.from({ length: cards }, (_, card) => (
            <span key={card} className="mk-mini-card" data-active={(column === 1 && card === 0) || undefined}>
              <Line className="w-full" />

              <Line className="mk-mini-line-faint w-1/2" />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Calendar() {
  const marked = new Set([4, 9, 17]);

  return (
    <Window className="w-[86%]">
      <div className="flex items-center justify-between px-3 pt-3">
        <Line className="w-16" />

        <CalendarDays aria-hidden className="size-3.5 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {Array.from({ length: 21 }, (_, day) => (
          <span
            key={day}
            className="mk-mini-day"
            data-marked={marked.has(day) || undefined}
            data-today={day === 9 || undefined}
          />
        ))}
      </div>
    </Window>
  );
}

function Playbook() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileText aria-hidden className="size-3.5 text-muted-foreground" />

        <Line className="w-20" />
      </div>

      <div className="grid gap-1.5 p-3">
        <Line className="w-1/3" />

        <Line className="w-full" />

        <Line className="w-5/6" />

        <span className="mk-mini-highlight">
          <Line className="w-3/4" />
        </span>

        <span className="mt-1 flex items-center gap-1.5">
          <MateMark />

          <Line className="w-14" />
        </span>
      </div>
    </Window>
  );
}

function ImportSheet() {
  return (
    <div className="flex w-[86%] items-center gap-3">
      <Window className="w-[44%] shrink-0">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
          <FileSpreadsheet aria-hidden className="size-3 text-muted-foreground" />

          <Line className="w-10" />
        </div>

        <div className="mk-mini-grid p-2">
          {Array.from({ length: 12 }, (_, cell) => (
            <span key={cell} className="mk-mini-cell" />
          ))}
        </div>
      </Window>

      <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />

      <Window className="flex-1">
        <div className="grid gap-1.5 p-2.5">
          {[0, 1, 2].map((row) => (
            <Row key={row} active={row === 0}>
              <span aria-hidden className="mk-mini-avatar size-3" />

              <Line className={row === 2 ? "w-1/2" : "w-4/5"} />
            </Row>
          ))}
        </div>
      </Window>
    </div>
  );
}

function SearchVisual() {
  return (
    <Window className="w-[86%]">
      <div className="p-3">
        <span className="mk-mini-search">
          <Search aria-hidden className="size-3 text-muted-foreground" />

          <Line className="w-16" />
        </span>
      </div>

      <div className="grid gap-1.5 px-3 pb-3">
        {[0, 1].map((row) => (
          <Row key={row} active={row === 0}>
            <span aria-hidden className="mk-mini-avatar size-3" />

            <Line className={row === 0 ? "w-2/3" : "w-1/2"} />

            <span className="mk-mini-pill ml-auto">
              <Line className="w-6" />
            </span>
          </Row>
        ))}
      </div>
    </Window>
  );
}

function Contacts() {
  return (
    <Window className="w-[86%]">
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <span aria-hidden className="mk-mini-avatar size-6" />

        <span className="grid flex-1 gap-1">
          <Line className="w-20" />

          <Line className="mk-mini-line-faint w-14" />
        </span>
      </div>

      <div className="grid gap-1.5 p-3">
        <Row>
          <UsersRound aria-hidden className="size-3 text-muted-foreground" />

          <Line className="w-1/2" />
        </Row>

        <Row active>
          <FileText aria-hidden className="size-3 text-foreground" />

          <Line className="w-3/4" />
        </Row>
      </div>
    </Window>
  );
}

const VISUALS: Record<UseCaseVisualKind, () => ReactNode> = {
  agent: Agent,
  calendar: Calendar,
  contacts: Contacts,
  conversation: Conversation,
  dashboard: Dashboard,
  import: ImportSheet,
  inbox: Inbox,
  pipeline: Pipeline,
  playbook: Playbook,
  proposal: Proposal,
  search: SearchVisual,
  team: Team,
};

export function UseCaseVisual({ kind }: { kind: UseCaseVisualKind }) {
  const Visual = VISUALS[kind];

  return (
    <div aria-hidden className="mk-usecase-stage" data-use-case-visual={kind}>
      <Visual />
    </div>
  );
}
