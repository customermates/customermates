import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export const WIDGET_EDITOR_GRID_CLASS =
  "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]";

export function WidgetEditorColumns({ preview, settings }: { preview: ReactNode; settings: ReactNode }) {
  return (
    <div className={WIDGET_EDITOR_GRID_CLASS} data-widget-editor="split">
      <div
        className="min-w-0 space-y-6 [&>section]:border-t [&>section]:border-border [&>section]:pt-6"
        data-slot="widget-editor-settings"
      >
        {settings}
      </div>

      <div className="min-w-0 lg:sticky lg:top-0" data-slot="widget-editor-preview">
        {preview}
      </div>
    </div>
  );
}

export function WidgetPreviewSkeleton() {
  return (
    <div aria-hidden className="flex h-full min-h-0 flex-col gap-3">
      <Skeleton className="h-3 w-28" />

      <div className="flex min-h-0 flex-1 items-end gap-3">
        {["h-2/5", "h-4/5", "h-3/5", "h-full", "h-1/2"].map((height) => (
          <Skeleton key={height} className={`${height} flex-1 rounded-md`} />
        ))}
      </div>
    </div>
  );
}

export function WidgetEditorSection({ children, id, title }: { children: ReactNode; id: string; title: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4" id={id}>
      <h3 className="text-sm font-medium" id={`${id}-heading`}>
        {title}
      </h3>

      {children}
    </section>
  );
}
