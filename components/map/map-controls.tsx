"use client";

import type { LucideIcon } from "lucide-react";
import type { BasemapStatus } from "./use-basemap";
import type { MapViewLabels } from "./map-types";

import { Minus, Plus, RotateCcw, Scan } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

type ControlProps = {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
};

function MapControlButton({ icon: Icon, label, disabled = false, className, onClick }: ControlProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn("size-8 rounded-none text-foreground", className)}
          disabled={disabled}
          size="icon-sm"
          variant="ghost"
          onClick={onClick}
        >
          <Icon aria-hidden className="size-4" />
        </Button>
      </TooltipTrigger>

      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

type Props = {
  labels: MapViewLabels;
  status: BasemapStatus;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onRetry: () => void;
};

export function MapControls({ labels, status, canZoomIn, canZoomOut, onZoomIn, onZoomOut, onReset, onRetry }: Props) {
  return (
    <>
      <div
        data-map-control
        className="absolute top-2 left-2 flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm"
      >
        <MapControlButton disabled={!canZoomIn} icon={Plus} label={labels.zoomIn} onClick={onZoomIn} />

        <MapControlButton
          className="border-t border-border"
          disabled={!canZoomOut}
          icon={Minus}
          label={labels.zoomOut}
          onClick={onZoomOut}
        />

        <MapControlButton className="border-t border-border" icon={Scan} label={labels.reset} onClick={onReset} />
      </div>

      {status === "loading" ? (
        <div
          data-map-control
          className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow-sm"
          role="status"
        >
          <Spinner aria-hidden aria-label={labels.loading} className="size-3.5" />

          {labels.loading}
        </div>
      ) : null}

      {status === "failed" ? (
        <div data-map-control className="absolute bottom-2 left-2" role="alert">
          <Button className="shadow-sm" size="xs" variant="secondary" onClick={onRetry}>
            <RotateCcw aria-hidden />

            {labels.failed}
          </Button>
        </div>
      ) : null}

      <div
        data-map-control
        className="pointer-events-none absolute right-1 bottom-1 max-w-[70%] truncate rounded-sm bg-card/70 px-1 text-[10px] leading-4 text-muted-foreground"
      >
        {labels.attribution}
      </div>
    </>
  );
}
