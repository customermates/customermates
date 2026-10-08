"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { NavGroup, NavItem } from "./nav-main";
import type { ResolvedSidebar, SidebarSection } from "./sidebar-layout";

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

import { createSidebarSection, sectionLabel, useDeleteSidebarSection, useResolvedSidebar } from "./nav-sections";
import {
  isCustomSection,
  moveSidebarItem,
  moveSidebarSection,
  sectionOfItem,
  setSidebarItemHidden,
  shiftSidebarItem,
  shiftSidebarSection,
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
  const sections = resolved.sections.filter(
    (section) => isCustomSection(section.id) || section.items.some((key) => items.has(key)),
  );
  const shown = new Set(sections.map((section) => section.id));
  const sectionNames = sections.map((section) => ({ id: section.id, label: sectionLabel(groups, section) }));
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

  function targetSection(current: ResolvedSidebar, overId: string) {
    if (overId.startsWith(SECTION_ID_PREFIX)) return sectionFromDropId(overId);
    return sectionOfItem(current, overId)?.id ?? null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDraft(stored);
    setActiveId(String(active.id));
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const id = String(active.id);
    if (!draft || !over || id.startsWith(SECTION_ID_PREFIX)) return;
    const overId = String(over.id);
    const target = targetSection(draft, overId);
    const source = sectionOfItem(draft, id);
    if (!target || !source || source.id === target) return;
    const index = overId.startsWith(SECTION_ID_PREFIX)
      ? undefined
      : draft.sections.find((section) => section.id === target)?.items.indexOf(overId);
    setDraft(moveSidebarItem(draft, id, target, index));
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
      const target = targetSection(current, overId);
      if (target) next = moveSidebarSection(current, sectionFromDropId(id), target);
    } else if (!overId.startsWith(SECTION_ID_PREFIX)) {
      const section = sectionOfItem(current, overId);
      if (section && section.id === sectionOfItem(current, id)?.id)
        next = moveSidebarItem(current, id, section.id, section.items.indexOf(overId));
    }
    if (JSON.stringify(sidebarLayoutOf(next)) !== JSON.stringify(sidebarLayoutOf(stored))) save(next);
  }

  const activeItem = activeId && !activeId.startsWith(SECTION_ID_PREFIX) ? items.get(activeId) : undefined;
  const activeSection = activeId?.startsWith(SECTION_ID_PREFIX)
    ? sections.find((section) => sectionDragId(section.id) === activeId)
    : undefined;

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
            <SortableContext
              items={sections.map((section) => sectionDragId(section.id))}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-3">
                {sections.map((section, index) => (
                  <EditorSection
                    key={section.id}
                    activeId={activeId}
                    canMoveDown={index < sections.length - 1}
                    canMoveUp={index > 0}
                    items={items}
                    label={sectionLabel(groups, section)}
                    renaming={renaming === section.id}
                    resolved={resolved}
                    section={section}
                    sectionNames={sectionNames}
                    onChange={save}
                    onDelete={() => {
                      onOpenChange(false);
                      deleteSection(section.id, sectionLabel(groups, section));
                    }}
                    onMove={(by) => save(shiftSidebarSection(resolved, section.id, by, shown))}
                    onNewSection={newSection}
                    onRename={(name) => {
                      setRenaming(null);
                      if (name) save(updateSidebarSection(resolved, section.id, { name }));
                    }}
                    onStartRename={() => setRenaming(section.id)}
                  />
                ))}
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
  resolved: ResolvedSidebar;
  sectionNames: Array<{ id: string; label: string }>;
  renaming: boolean;
  activeId: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: ResolvedSidebar) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
  onNewSection: (item: string) => void;
};

function EditorSection({
  section,
  label,
  items,
  resolved,
  sectionNames,
  renaming,
  activeId,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDelete,
  onStartRename,
  onRename,
  onNewSection,
}: SectionProps) {
  const t = useTranslations();
  const custom = isCustomSection(section.id);
  const keys = section.items.filter((key) => items.has(key));
  const draggingSection = activeId?.startsWith(SECTION_ID_PREFIX) ?? false;
  const dragging = activeId !== null && !draggingSection;
  const sortable = useSortable({ id: sectionDragId(section.id), disabled: { draggable: false, droppable: dragging } });
  const droppable = useDroppable({
    id: sectionDragId(section.id) + DROP_SUFFIX,
    disabled: draggingSection || (activeId !== null && keys.includes(activeId)),
  });
  const visible = keys.filter((key) => !resolved.hidden.has(key));
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
        ) : custom ? (
          <button
            className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            type="button"
            onClick={onStartRename}
          >
            {label}
          </button>
        ) : (
          <h3 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{label}</h3>
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
            {custom && <DropdownMenuItem onSelect={onStartRename}>{t("SidebarCustomize.rename")}</DropdownMenuItem>}

            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
              {t("SidebarCustomize.moveUp")}
            </DropdownMenuItem>

            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
              {t("SidebarCustomize.moveDown")}
            </DropdownMenuItem>

            {custom && (
              <>
                <DropdownMenuSeparator />

                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  {t("SidebarCustomize.deleteSection")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul ref={droppable.setNodeRef} className="flex min-h-10 flex-col py-1">
          {keys.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t("SidebarCustomize.emptySection")}</li>
          )}

          {keys.map((key) => {
            const item = items.get(key);
            if (!item) return null;
            const position = visible.indexOf(key);
            return (
              <EditorItem
                key={key}
                canMoveDown={position >= 0 && position < visible.length - 1}
                canMoveUp={position > 0}
                droppable={!draggingSection}
                item={item}
                resolved={resolved}
                section={section}
                sectionNames={sectionNames}
                onChange={onChange}
                onNewSection={onNewSection}
              />
            );
          })}
        </ul>
      </SortableContext>
    </section>
  );
}

type ItemProps = {
  item: NavItem;
  droppable: boolean;
  section: SidebarSection;
  resolved: ResolvedSidebar;
  sectionNames: Array<{ id: string; label: string }>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (next: ResolvedSidebar) => void;
  onNewSection: (item: string) => void;
};

function EditorItem({
  item,
  droppable,
  section,
  resolved,
  sectionNames,
  canMoveUp,
  canMoveDown,
  onChange,
  onNewSection,
}: ItemProps) {
  const t = useTranslations();
  const sortable = useSortable({ id: item.key, disabled: { draggable: false, droppable: !droppable } });
  const hidden = resolved.hidden.has(item.key);

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
          <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onChange(shiftSidebarItem(resolved, item.key, -1))}>
            {t("SidebarCustomize.moveUp")}
          </DropdownMenuItem>

          <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onChange(shiftSidebarItem(resolved, item.key, 1))}>
            {t("SidebarCustomize.moveDown")}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("SidebarCustomize.moveToSection")}</DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              {sectionNames
                .filter((candidate) => candidate.id !== section.id)
                .map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.id}
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
