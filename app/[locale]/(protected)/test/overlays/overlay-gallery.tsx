"use client";

import type { AnchorCell, ContentKind, OverlayCaseId } from "./gallery-fixtures";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal, type ModalSize } from "@/components/modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";

import { GalleryActions, GalleryBody, GalleryFormBody } from "./gallery-body";
import {
  ANCHOR_CELL_CLASS,
  GERMAN_FIXTURES,
  GERMAN_PARAGRAPH,
  LONG_PARAGRAPH,
  OVERLAY_CASE_IDS,
  UNBREAKABLE_IDENTIFIER,
  actionLabels,
} from "./gallery-fixtures";

const MODAL_SIZE: Partial<Record<OverlayCaseId, ModalSize>> = {
  "modal-sm": "sm",
  "modal-lg": "lg",
  "modal-xl": "xl",
};

const OPTION_VALUES = [
  "short",
  "Neu synchronisieren",
  "Benutzerdefiniert",
  "Unterhaltungseinstellungen",
  "Darstellungsmodus-Umschalter",
  UNBREAKABLE_IDENTIFIER,
];

export function OverlayGallery() {
  const params = useSearchParams();
  const caseId = (params.get("case") ?? "modal-md") as OverlayCaseId;
  const content = (params.get("content") ?? "long") as ContentKind;
  const anchor = (params.get("anchor") ?? "mc") as AnchorCell;
  const actions = Number(params.get("actions") ?? "2");
  const state = params.get("state") ?? "idle";
  const startsOpen = params.get("open") !== "0";
  const safe = params.get("safe");
  const matrixRun = params.get("matrixRun");
  const matrixCell = params.get("matrixCell");

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!safe) return;

    const root = document.documentElement;
    root.style.setProperty("--safe-top", `${safe}px`);
    root.style.setProperty("--safe-bottom", `${safe}px`);

    return () => {
      root.style.removeProperty("--safe-top");
      root.style.removeProperty("--safe-bottom");
    };
  }, [safe]);

  useEffect(() => {
    triggerRef.current?.scrollIntoView({ block: "center" });
    if (startsOpen) setOpen(true);
  }, [caseId, startsOpen]);

  const loading = state === "loading";
  const error = state === "error";
  const title = content === "de" ? "Unterhaltungseinstellungen" : "Overlay case";
  const anchorClass = ANCHOR_CELL_CLASS[anchor];
  const fixture = {
    caseId,
    content,
    anchor,
    actions,
    state,
    startsOpen,
    safe: safe ? Number(safe) : 0,
    matrixRun,
    matrixCell,
  };

  const cardChrome = (
    <AppCard>
      <AppCardHeader>
        <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
      </AppCardHeader>

      <AppCardBody>
        {caseId === "modal-form" ? <GalleryFormBody error={error} /> : <GalleryBody content={content} />}

        {caseId === "nested-modal-select" && (
          <Select>
            <SelectTrigger id="overlay-nested-select">
              <SelectValue placeholder="Benutzerdefiniert" />
            </SelectTrigger>

            <SelectContent>
              {OPTION_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </AppCardBody>

      <AppCardFooter>
        <GalleryActions count={actions} loading={loading} />
      </AppCardFooter>
    </AppCard>
  );

  const trigger = (
    <Button ref={triggerRef} className={anchorClass} id="overlay-trigger" type="button" onClick={() => setOpen(true)}>
      Open {caseId}
    </Button>
  );

  return (
    <div
      className="grid min-h-[70svh] w-full grid-cols-3 grid-rows-3 gap-4 p-4"
      data-overlay-gallery-fixture={JSON.stringify(fixture)}
    >
      {caseId.startsWith("modal-") || caseId === "nested-modal-select" ? (
        <>
          {trigger}

          <AppModal open={open} size={MODAL_SIZE[caseId] ?? "md"} title={title} onClose={() => setOpen(false)}>
            {cardChrome}
          </AppModal>
        </>
      ) : null}

      {caseId === "alert-dialog" && (
        <>
          {trigger}

          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" size="sm">
              <AppCard>
                <AppCardHeader>
                  <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
                </AppCardHeader>

                <AppCardBody>
                  <AlertDialogDescription className="text-sm text-foreground">
                    {content === "de" ? GERMAN_PARAGRAPH : LONG_PARAGRAPH}
                  </AlertDialogDescription>
                </AppCardBody>

                <AppCardFooter>
                  <AlertDialogCancel id="overlay-action-cancel">Cancel</AlertDialogCancel>

                  <AlertDialogAction id="overlay-action-submit" variant="destructive">
                    Delete
                  </AlertDialogAction>
                </AppCardFooter>
              </AppCard>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      {caseId === "command" && (
        <>
          {trigger}

          <CommandDialog open={open} title="Overlay command" onOpenChange={setOpen}>
            <CommandInput placeholder="Unterhaltungseinstellungen" />

            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>

              <CommandGroup heading="Benutzerdefiniert">
                {OPTION_VALUES.map((value) => (
                  <CommandItem key={value} value={value}>
                    <span className="min-w-0 truncate">{value}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </>
      )}

      {caseId.startsWith("sheet-") && (
        <>
          {trigger}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side={caseId.replace("sheet-", "") as "top" | "right" | "bottom" | "left"}>
              <SheetHeader>
                <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
              </SheetHeader>

              <SheetBody>
                <GalleryBody content={content} />
              </SheetBody>

              <SheetFooter>
                <GalleryActions count={actions} loading={loading} />
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}

      {caseId === "drawer-bottom" && (
        <>
          {trigger}

          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="min-w-0 truncate">{title}</DrawerTitle>
              </DrawerHeader>

              <DrawerBody>
                <GalleryBody content={content} />
              </DrawerBody>

              <DrawerFooter>
                <GalleryActions count={actions} loading={loading} />
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {caseId === "popover" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>

          <PopoverContent>
            <GalleryBody content={content} />

            <div className="mt-4 flex flex-wrap gap-2">
              <GalleryActions count={actions} loading={loading} />
            </div>
          </PopoverContent>
        </Popover>
      )}

      {caseId === "nested-popover-dropdown" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>

          <PopoverContent>
            <GalleryBody content="short" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="mt-3 w-full" id="overlay-nested-dropdown" variant="outline">
                  Benutzerdefiniert
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start">
                {OPTION_VALUES.map((value) => (
                  <DropdownMenuItem key={value}>{value}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </PopoverContent>
        </Popover>
      )}

      {caseId === "responsive-overlay" && (
        <ResponsiveOverlay
          footer={<GalleryActions count={actions} loading={loading} />}
          open={open}
          popoverClassName="w-96"
          title={title}
          trigger={trigger}
          onOpenChange={setOpen}
        >
          <div className="p-3">
            <GalleryBody content={content} />
          </div>
        </ResponsiveOverlay>
      )}

      {(caseId === "dropdown" || caseId === "dropdown-sub") && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>

          <DropdownMenuContent align="start">
            {OPTION_VALUES.map((value) => (
              <DropdownMenuItem key={value}>{value}</DropdownMenuItem>
            ))}

            {caseId === "dropdown-sub" && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Benutzerdefiniert</DropdownMenuSubTrigger>

                <DropdownMenuSubContent>
                  {OPTION_VALUES.concat(OPTION_VALUES).map((value, index) => (
                    <DropdownMenuItem key={`${value}-${index}`}>{value}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {caseId === "select" && (
        <Select open={open} onOpenChange={setOpen}>
          <SelectTrigger className={anchorClass} id="overlay-trigger">
            <SelectValue placeholder="Benutzerdefiniert" />
          </SelectTrigger>

          <SelectContent>
            {OPTION_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {caseId === "tooltip" && (
        <TooltipProvider>
          <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>

            <TooltipContent>
              {content === "identifier" ? UNBREAKABLE_IDENTIFIER : content === "de" ? GERMAN_PARAGRAPH : LONG_PARAGRAPH}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            cases: OVERLAY_CASE_IDS,
            germanFixtures: GERMAN_FIXTURES.map((fixture) => fixture.sourceKey),
            actionLabels: actionLabels(6),
          }),
        }}
        id="overlay-gallery-manifest"
        type="application/json"
      />
    </div>
  );
}
