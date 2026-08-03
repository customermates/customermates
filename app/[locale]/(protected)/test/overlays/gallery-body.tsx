"use client";

import type { ContentKind } from "./gallery-fixtures";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  CODE_SAMPLE,
  GERMAN_FIXTURES,
  GERMAN_PARAGRAPH,
  LONG_PARAGRAPH,
  UNBREAKABLE_IDENTIFIER,
  UNBREAKABLE_URL,
  actionLabels,
} from "./gallery-fixtures";

export function GalleryBody({ content }: { content: ContentKind }) {
  if (content === "short") return <p className="text-sm">A short body.</p>;

  if (content === "de") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">{GERMAN_PARAGRAPH}</p>

        <ul className="flex flex-col gap-1 text-sm">
          {GERMAN_FIXTURES.map((fixture) => (
            <li key={fixture.sourceKey} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">{fixture.sourceKey}</span>

              <span className="shrink-0 font-medium">{fixture.value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (content === "identifier") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="font-mono break-all">{UNBREAKABLE_IDENTIFIER}</p>

        <p className="font-mono break-all">{UNBREAKABLE_URL}</p>

        <p className="font-mono">{UNBREAKABLE_IDENTIFIER}</p>
      </div>
    );
  }

  if (content === "code") {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{CODE_SAMPLE}</pre>
    );
  }

  if (content === "overflow") {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <p key={index} className="text-sm">
            {`${index + 1}. ${LONG_PARAGRAPH}`}
          </p>
        ))}
      </div>
    );
  }

  return <p className="text-sm">{LONG_PARAGRAPH}</p>;
}

export function GalleryFormBody({ error }: { error: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="overlay-field-name">Name</Label>

        <Input defaultValue="" id="overlay-field-name" placeholder="Benutzerdefiniert" />

        {error && (
          <p className="text-sm text-destructive">
            Dieser Wert ist ungültig. Bitte geben Sie einen benutzerdefinierten Namen ein, der nicht bereits vergeben
            ist.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="overlay-field-endpoint">Endpoint</Label>

        <Input defaultValue={UNBREAKABLE_URL} id="overlay-field-endpoint" />
      </div>

      <p className="text-sm text-muted-foreground">{LONG_PARAGRAPH}</p>
    </div>
  );
}

export function GalleryActions({ count, loading }: { count: number; loading: boolean }) {
  const labels = actionLabels(count);
  return (
    <>
      {labels.map((label, index) => (
        <Button
          key={label}
          disabled={loading}
          id={index === 0 ? "overlay-action-submit" : `overlay-action-${index}`}
          type="button"
          variant={index === 0 ? "default" : "outline"}
        >
          {label}
        </Button>
      ))}
    </>
  );
}
