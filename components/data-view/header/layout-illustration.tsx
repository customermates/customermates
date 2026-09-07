import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  layout: "table" | "board";
};

const TABLE_ROWS = [
  { key: "first", tone: "bg-primary/55" },
  { key: "second", tone: "bg-primary" },
  { key: "third", tone: "bg-primary/55" },
];

const BOARD_COLUMNS = [
  {
    key: "left",
    blocks: [
      { height: "h-3", tone: "bg-primary" },
      { height: "h-2", tone: "bg-primary/55" },
    ],
  },
  {
    key: "middle",
    blocks: [
      { height: "h-2", tone: "bg-primary" },
      { height: "h-3.5", tone: "bg-primary/55" },
    ],
  },
  { key: "right", blocks: [{ height: "h-2.5", tone: "bg-primary" }] },
];

export function LayoutIllustration({ className, layout }: Props) {
  if (layout === "board") {
    return (
      <span aria-hidden className={cn("flex h-10 w-full max-w-28 items-start justify-center gap-1", className)}>
        {BOARD_COLUMNS.map((column) => (
          <span key={column.key} className="flex w-4 flex-col gap-1">
            <span className="h-1 w-full rounded-full bg-border-strong" />

            {column.blocks.map((block) => (
              <span key={block.height} className={cn("w-full rounded-sm", block.height, block.tone)} />
            ))}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden className={cn("flex h-10 w-full max-w-28 flex-col justify-center gap-1", className)}>
      <span className="h-1.5 w-full rounded-sm bg-border-strong" />

      {TABLE_ROWS.map((row) => (
        <span key={row.key} className={cn("h-1.5 w-full rounded-sm", row.tone)} />
      ))}
    </span>
  );
}
