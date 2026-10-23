"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";
import { RECORD_FILE_NAME_MAX_LENGTH } from "@/features/record-files/record-file-name";

export function RecordFileNameInput({
  name,
  label,
  className,
  onDone,
}: {
  name: string;
  label: string;
  className?: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(name);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(commit ? value : null);
  };
  return (
    <Input
      autoFocus
      aria-label={label}
      className={cn("h-7 min-w-0 px-2 text-sm", className)}
      data-local-escape=""
      data-record-file-name-input=""
      maxLength={RECORD_FILE_NAME_MAX_LENGTH}
      value={value}
      onBlur={() => finish(true)}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => {
        const dot = name.lastIndexOf(".");
        event.currentTarget.setSelectionRange(0, dot > 0 ? dot : name.length);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        finish(event.key === "Enter");
      }}
    />
  );
}
