"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { NavGroup, NavItem } from "./nav-main";
import type { MoveTarget } from "./nav-sections";
import type { ResolvedSidebar, SidebarContainer, SidebarEntry, SidebarSection } from "./sidebar-layout";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListPlus, MoreHorizontal, RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { createPortal } from "react-dom";

import { AppModal } from "@/components/modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DragHandle } from "@/components/shared/drag-handle";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { SIDEBAR_SECTION_NAME_MAX } from "@/features/p13n/sidebar-layout.schema";

import {
  createSidebarSection,
  entryPosition,
  itemPosition,
  moveTargets,
  sectionLabel,
  useDeleteSidebarSection,
  useResolvedSidebar,
} from "./nav-sections";
import {
  containerOf,
  entryKey,
  moveSidebarEntry,
  moveSidebarItem,
  sectionsOf,
  setSidebarItemHidden,
  shiftSidebarEntry,
  shiftSidebarItem,
  sidebarLayoutOf,
  updateSidebarSection,
} from "./sidebar-layout";

const SECTION_ID_PREFIX = "section:";
const DROP_SUFFIX = ":items";

type Props = {
  groups: NavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function sectionDragId(id: string) {
  return SECTION_ID_PREFIX + id;
}

function sectionFromDropId(id: string) {
  return id.slice(SECTION_ID_PREFIX.length).replace(DROP_SUFFIX, "");
}

type Run = { kind: "items"; key: string; items: string[] } | { kind: "section"; section: SidebarSection };

function runsOf(entries: SidebarEntry[], isKnown: (item: string) => boolean): Run[] {
  const runs: Run[] = [];
  for (const entry of entries) {
    if (entry.kind === "section") {
      runs.push({ kind: "section", section: entry });
      continue;
    }
    if (!isKnown(entry.id)) continue;
    const last = runs.at(-1);
    if (last?.kind === "items") last.items.push(entry.id);
    else runs.push({ kind: "items", key: `items:${entry.id}`, items: [entry.id] });
  }
  return runs;
}

export const SidebarCustomize = observer(({ groups, open, onOpenChange }: Props) => {
  const t = useTranslations();
  const dndId = useId();
  const { sidebarLayoutStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const deleteSection = useDeleteSidebarSection(groups);
  const stored = useResolvedSidebar(groups);
  const [draft, setDraft] = useState<ResolvedSidebar | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const resolved = draft ?? stored;
  const items = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item])));
  const isKnown = (item: string) => items.has(item);
  const isItemShown = (item: string) => isKnown(item) && !resolved.hidden.has(item);
  const isEntryShown = (key: string) => key.startsWith(SECTION_ID_PREFIX) || isKnown(key);
  const targets = moveTargets(groups, resolved, t("SidebarCustomize.topLevel"));
  const topLevelKeys = resolved.entries.map(entryKey).filter(isEntryShown);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function save(next: ResolvedSidebar) {
    runUserAction(() => sidebarLayoutStore.save(sidebarLayoutOf(next)));
  }

  function newSection(item?: string) {
    const next = createSidebarSection(resolved, t("SidebarCustomize.newSectionName"), item);
    save(next.resolved);
    setRenaming(next.id);
  }

  function reset() {
    onOpenChange(false);
    showConfirmation({
      title: t("SidebarCustomize.resetTitle"),
      message: t("SidebarCustomize.resetMessage"),
      confirmLabel: t("SidebarCustomize.reset"),
      successKey: "SidebarCustomize.resetDone",
      onConfirm: () => sidebarLayoutStore.save(null),
    });
  }

  function itemTarget(
    current: ResolvedSidebar,
    overId: string,
  ): { container: SidebarContainer; index?: number } | null {
    if (overId.startsWith(SECTION_ID_PREFIX)) return { container: sectionFromDropId(overId) };
    const container = containerOf(current, overId);
    if (container === undefined) return null;
    if (container === null)
      return { container, index: current.entries.findIndex((entry) => entry.kind === "item" && entry.id === overId) };
    return {
      container,
      index: sectionsOf(current)
        .find((section) => section.id === container)
        ?.items.indexOf(overId),
    };
  }

  function entryTarget(current: ResolvedSidebar, overId: string): string | null {
    if (overId.startsWith(SECTION_ID_PREFIX)) return sectionDragId(sectionFromDropId(overId));
    const container = containerOf(current, overId);
    if (container === undefined) return null;
    return container === null ? overId : sectionDragId(container);
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDraft(stored);
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const id = String(active.id);
    if (!draft || !over || id.startsWith(SECTION_ID_PREFIX)) return;
    const target = itemTarget(draft, String(over.id));
    const source = containerOf(draft, id);
    if (!target || source === undefined || source === target.container) return;
    setDraft(moveSidebarItem(draft, id, target.container, target.index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = draft;
    const id = String(active.id);
    setDraft(null);
    setActiveId(null);
    if (!current || !over) return;
    const overId = String(over.id);
    let next = current;
    if (id.startsWith(SECTION_ID_PREFIX)) {
      const target = entryTarget(current, overId);
      if (target) next = moveSidebarEntry(current, id, target);
    } else {
      const target = itemTarget(current, overId);
      if (target && target.index !== undefined && containerOf(current, id) === target.container)
        next = moveSidebarItem(current, id, target.container, target.index);
    }
    if (JSON.stringify(sidebarLayoutOf(next)) !== JSON.stringify(sidebarLayoutOf(stored))) save(next);
  }

  const activeItem = activeId && !activeId.startsWith(SECTION_ID_PREFIX) ? items.get(activeId) : undefined;
  const activeSection = activeId?.startsWith(SECTION_ID_PREFIX)
    ? sectionsOf(resolved).find((section) => sectionDragId(section.id) === activeId)
    : undefined;

  function editorItem(key: string) {
    const item = items.get(key);
    if (!item) return null;
    return (
      <EditorItem
        key={key}
        droppable={!activeSection}
        isShown={isItemShown}
        item={item}
        resolved={resolved}
        targets={targets}
        onChange={save}
        onNewSection={newSection}
      />
    );
  }

  return (
    <AppModal
      actions={[
        {
          id: "sidebar-customize-new-section",
          icon: ListPlus,
          label: t("SidebarCustomize.newSection"),
          onClick: () => newSection(),
        },
        ...(sidebarLayoutStore.layout
          ? [{ id: "sidebar-customize-reset", icon: RotateCcw, label: t("SidebarCustomize.reset"), onClick: reset }]
          : []),
      ]}
      open={open}
      size="md"
      title={t("SidebarCustomize.title")}
      onClose={() => onOpenChange(false)}
    >
      <AppCard>
        <AppCardHeader className="flex-col items-start gap-1">
          <h2 className="text-x-lg">{t("SidebarCustomize.title")}</h2>

          <p className="text-sm text-muted-foreground">{t("SidebarCustomize.hint")}</p>
        </AppCardHeader>

        <AppCardBody>
          <DndContext
            collisionDetection={closestCenter}
            id={dndId}
            sensors={sensors}
            onDragCancel={() => {
              setDraft(null);
              setActiveId(null);
            }}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
          >
            <SortableContext items={topLevelKeys} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {runsOf(resolved.entries, isKnown).map((run) => {
                  if (run.kind === "items") {
                    return (
                      <ul
                        key={run.key}
                        aria-label={t("SidebarCustomize.topLevel")}
                        className="flex flex-col rounded-lg border bg-card py-1"
                        data-customize-top-level=""
                      >
                        {run.items.map(editorItem)}
                      </ul>
                    );
                  }
                  const section = run.section;
                  const key = sectionDragId(section.id);
                  const position = entryPosition(resolved, key, isEntryShown);
                  return (
                    <EditorSection
                      key={section.id}
                      activeId={activeId}
                      canMoveDown={position.canMoveDown}
                      canMoveUp={position.canMoveUp}
                      items={items}
                      label={sectionLabel(groups, section)}
                      renaming={renaming === section.id}
                      section={section}
                      onDelete={() => {
                        onOpenChange(false);
                        deleteSection(section.id, sectionLabel(groups, section));
                      }}
                      onMove={(by) => save(shiftSidebarEntry(resolved, key, by, isEntryShown))}
                      onRename={(name) => {
                        setRenaming(null);
                        if (name) save(updateSidebarSection(resolved, section.id, { name }));
                      }}
                      onStartRename={() => setRenaming(section.id)}
                    >
                      {section.items.map(editorItem)}
                    </EditorSection>
                  );
                })}
              </div>
            </SortableContext>

            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay>
                  {activeItem ? (
                    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-md">
                      <Icon className="size-4 shrink-0 text-muted-foreground" icon={activeItem.icon} />

                      <span className="truncate">{activeItem.title}</span>
                    </div>
                  ) : activeSection ? (
                    <div className="rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-md">
                      {sectionLabel(groups, activeSection)}
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});

type SectionProps = {
  section: SidebarSection;
  label: string;
  items: ReadonlyMap<string, NavItem>;
  renaming: boolean;
  activeId: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  children: React.ReactNode;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
};

function EditorSection({
  section,
  label,
  items,
  renaming,
  activeId,
  canMoveUp,
  canMoveDown,
  children,
  onMove,
  onDelete,
  onStartRename,
  onRename,
}: SectionProps) {
  const t = useTranslations();
  const keys = section.items.filter((key) => items.has(key));
  const draggingSection = activeId?.startsWith(SECTION_ID_PREFIX) ?? false;
  const dragging = activeId !== null && !draggingSection;
  const sortable = useSortable({ id: sectionDragId(section.id), disabled: { draggable: false, droppable: dragging } });
  const droppable = useDroppable({
    id: sectionDragId(section.id) + DROP_SUFFIX,
    disabled: draggingSection || (activeId !== null && keys.includes(activeId)),
  });
  const highlighted = dragging && (droppable.isOver || keys.some((key) => key === droppable.over?.id));

  return (
    <section
      ref={sortable.setNodeRef}
      aria-label={label}
      className={cn(
        "rounded-lg border bg-card transition-colors",
        sortable.isDragging && "opacity-50",
        highlighted && "border-primary ring-1 ring-primary",
      )}
      data-customize-section={label}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
    >
      <div className="flex min-h-10 items-center gap-1 border-b px-1.5 py-1">
        <DragHandle
          attributes={sortable.attributes}
          label={t("SidebarCustomize.dragSection", { section: label })}
          listeners={sortable.listeners}
          setActivatorNodeRef={sortable.setActivatorNodeRef}
        />

        {renaming ? (
          <SectionNameInput initial={label} onDone={onRename} />
        ) : (
          <button
            className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            type="button"
            onClick={onStartRename}
          >
            {label}
          </button>
        )}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("SidebarCustomize.sectionActions", { section: label })}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Icon icon={MoreHorizontal} />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onStartRename}>{t("SidebarCustomize.rename")}</DropdownMenuItem>

            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
              {t("SidebarCustomize.moveUp")}
            </DropdownMenuItem>

            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
              {t("SidebarCustomize.moveDown")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              {t("SidebarCustomize.deleteSection")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul ref={droppable.setNodeRef} className="flex min-h-10 flex-col py-1">
          {keys.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t("SidebarCustomize.emptySection")}</li>
          )}

          {children}
        </ul>
      </SortableContext>
    </section>
  );
}

type ItemProps = {
  item: NavItem;
  droppable: boolean;
  resolved: ResolvedSidebar;
  targets: MoveTarget[];
  isShown: (item: string) => boolean;
  onChange: (next: ResolvedSidebar) => void;
  onNewSection: (item: string) => void;
};

function EditorItem({ item, droppable, resolved, targets, isShown, onChange, onNewSection }: ItemProps) {
  const t = useTranslations();
  const sortable = useSortable({ id: item.key, disabled: { draggable: false, droppable: !droppable } });
  const hidden = resolved.hidden.has(item.key);
  const position = itemPosition(resolved, item.key, isShown);

  return (
    <li
      ref={sortable.setNodeRef}
      className={cn("flex items-center gap-1 px-1.5 py-0.5 text-sm", sortable.isDragging && "opacity-50")}
      data-customize-item={item.key}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
    >
      <DragHandle
        attributes={sortable.attributes}
        label={t("SidebarCustomize.dragItem", { item: item.title })}
        listeners={sortable.listeners}
        setActivatorNodeRef={sortable.setActivatorNodeRef}
      />

      <Icon className={cn("size-4 shrink-0 text-muted-foreground", hidden && "opacity-50")} icon={item.icon} />

      <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground")}>{item.title}</span>

      <Switch
        aria-label={t("SidebarCustomize.show", { item: item.title })}
        checked={!hidden}
        onCheckedChange={(checked) => onChange(setSidebarItemHidden(resolved, item.key, !checked))}
      />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("SidebarCustomize.itemActions", { item: item.title })}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Icon icon={MoreHorizontal} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!position.canMoveUp}
            onSelect={() => onChange(shiftSidebarItem(resolved, item.key, -1, isShown))}
          >
            {t("SidebarCustomize.moveUp")}
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!position.canMoveDown}
            onSelect={() => onChange(shiftSidebarItem(resolved, item.key, 1, isShown))}
          >
            {t("SidebarCustomize.moveDown")}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("SidebarCustomize.moveToSection")}</DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              {targets
                .filter((candidate) => candidate.id !== position.container)
                .map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.id ?? ""}
                    onSelect={() => onChange(moveSidebarItem(resolved, item.key, candidate.id))}
                  >
                    <span className="truncate">{candidate.label}</span>
                  </DropdownMenuItem>
                ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => onNewSection(item.key)}>
                {t("SidebarCustomize.newSection")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function SectionNameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const t = useTranslations();
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (commit: boolean) => {
    if (done) return;
    setDone(true);
    onDone(commit && value.trim() ? value.trim() : null);
  };
  return (
    <Input
      autoFocus
      aria-label={t("SidebarCustomize.sectionName")}
      className="h-7 min-w-0 flex-1"
      maxLength={SIDEBAR_SECTION_NAME_MAX}
      value={value}
      onBlur={() => finish(true)}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === "Enter");
        }
      }}
    />
  );
}
