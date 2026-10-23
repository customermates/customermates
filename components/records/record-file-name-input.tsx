"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { IN_PLACE_EDITOR_CLASS, RECORD_NAME_HEADING_CLASS } from "./inline-edit-classes";
import { RECORD_FILE_NAME_MAX_LENGTH } from "@/features/record-files/record-file-name";

export function RecordFileNameInput({
  name,
  label,
  appearance = "inline",
  onDone,
}: {
  name: string;
  label: string;
  appearance?: "inline" | "heading";
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
    <div className={appearance === "heading" ? RECORD_NAME_HEADING_CLASS : IN_PLACE_EDITOR_CLASS}>
      <Input
        autoFocus
        aria-label={label}
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
    </div>
  );
}
