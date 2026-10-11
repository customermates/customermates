"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { NavGroup, NavItem } from "./nav-main";
import type { ResolvedSidebar, SidebarContainer, SidebarEntry } from "./sidebar-layout";

import { closestCenter, DndContext, MouseSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { AppLink } from "@/components/shared/app-link";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { SIDEBAR_SECTION_NAME_MAX } from "@/features/p13n/sidebar-layout.schema";

import { NAV_ITEM_ACTION_PADDING, NavBadge, NavMainParent } from "./nav-main";
import { NavLinkPendingIcon } from "./nav-link-pending-icon";
import {
  CUSTOM_SECTION_PREFIX,
  addSidebarSection,
  containerOf,
  entryKey,
  moveSidebarItem,
  removeSidebarSection,
  renameSidebarSection,
  resolveSidebar,
  sectionLabel,
  sectionsOf,
  setSidebarItemHidden,
  shiftSidebarEntry,
  shiftSidebarItem,
  sidebarDefaults,
  sidebarLayoutOf,
  updateSidebarSection,
} from "./sidebar-layout";

type Props = {
  groups: NavGroup[];
  customizable: boolean;
  selectedKey: string | null;
  pathname: string | null;
  onNavigate: (next: string) => void;
};

const SECTION_DROP_PREFIX = "section:";

export function useResolvedSidebar(groups: NavGroup[]) {
  const { sidebarLayoutStore } = useRootStore();
  const layout = sidebarLayoutStore.layout;
  return useMemo(() => resolveSidebar(sidebarDefaults(groups), layout), [groups, layout]);
}

export function useDeleteSidebarSection(groups: NavGroup[]) {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const titles = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item.title])));

  return (sectionId: string, label: string) => {
    const current = () => resolveSidebar(sidebarDefaults(groups), sidebarLayoutStore.layout);
    const moving = (sectionsOf(current()).find((section) => section.id === sectionId)?.items ?? []).filter((item) =>
      titles.has(item),
    );
    showConfirmation({
      title: t("SidebarCustomize.deleteSectionTitle", { section: label }),
      message: moving.length > 0 ? t("SidebarCustomize.deleteSectionMoves") : t("SidebarCustomize.deleteSectionEmpty"),
      details: moving.map((item) => titles.get(item) ?? item),
      confirmLabel: t("SidebarCustomize.deleteSection"),
      successKey: "SidebarCustomize.sectionDeleted",
      onConfirm: () => sidebarLayoutStore.save(sidebarLayoutOf(removeSidebarSection(current(), sectionId))),
    });
  };
}

export function createSidebarSection(resolved: ResolvedSidebar, baseName: string, item?: string) {
  const taken = new Set(sectionsOf(resolved).map((section) => section.name?.toLocaleLowerCase()));
  let name = baseName;
  for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1) name = `${baseName} ${index}`;
  const id = `${CUSTOM_SECTION_PREFIX}${crypto.randomUUID()}`;
  const container = item ? containerOf(resolved, item) : undefined;
  const after =
    item && container !== undefined ? (container === null ? item : SECTION_DROP_PREFIX + container) : undefined;
  const next = addSidebarSection(resolved, id, name, after);
  return { id, resolved: item ? moveSidebarItem(next, item, id) : next };
}

export type MoveTarget = { id: SidebarContainer; label: string };

export function moveTargets(groups: NavGroup[], resolved: ResolvedSidebar, topLevelLabel: string): MoveTarget[] {
  return [
    { id: null, label: topLevelLabel },
    ...sectionsOf(resolved).map((section) => ({ id: section.id, label: sectionLabel(groups, section) })),
  ];
}

type ItemProps = {
  item: NavItem;
  customizable: boolean;
  resolved: ResolvedSidebar;
  targets: MoveTarget[];
  isShown: (item: string) => boolean;
  isActive: boolean;
  open: boolean;
  pathname: string | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (next: string) => void;
  onChange: (next: ResolvedSidebar) => void;
  onNewSection: (item: string) => void;
  dropsClick: () => boolean;
};

export function itemPosition(resolved: ResolvedSidebar, item: string, isShown: (item: string) => boolean) {
  const container = containerOf(resolved, item);
  const siblings =
    container === null
      ? resolved.entries.map(entryKey)
      : (sectionsOf(resolved).find((section) => section.id === container)?.items ?? []);
  const visible = siblings.filter((candidate) => candidate === item || isShown(candidate));
  const index = visible.indexOf(item);
  return { container, canMoveUp: index > 0, canMoveDown: index >= 0 && index < visible.length - 1 };
}

export function SidebarItemMenuItems({
  itemKey,
  resolved,
  targets,
  isShown,
  hideable = false,
  onChange,
  onNewSection,
}: {
  itemKey: string;
  resolved: ResolvedSidebar;
  targets: MoveTarget[];
  isShown: (item: string) => boolean;
  hideable?: boolean;
  onChange: (next: ResolvedSidebar) => void;
  onNewSection: (item: string) => void;
}) {
  const t = useTranslations();
  const position = itemPosition(resolved, itemKey, isShown);
  return (
    <>
      <DropdownMenuItem
        disabled={!position.canMoveUp}
        onSelect={() => onChange(shiftSidebarItem(resolved, itemKey, -1, isShown))}
      >
        {t("SidebarCustomize.moveUp")}
      </DropdownMenuItem>

      <DropdownMenuItem
        disabled={!position.canMoveDown}
        onSelect={() => onChange(shiftSidebarItem(resolved, itemKey, 1, isShown))}
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
                onSelect={() => onChange(moveSidebarItem(resolved, itemKey, candidate.id))}
              >
                <span className="truncate">{candidate.label}</span>
              </DropdownMenuItem>
            ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => onNewSection(itemKey)}>{t("SidebarCustomize.newSection")}</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {hideable && (
        <>
          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => onChange(setSidebarItemHidden(resolved, itemKey, true))}>
            {t("SidebarCustomize.hide")}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

function SortableNavItem({
  item,
  customizable,
  resolved,
  targets,
  isShown,
  isActive,
  open,
  pathname,
  onOpenChange,
  onNavigate,
  onChange,
  onNewSection,
  dropsClick,
}: ItemProps) {
  const t = useTranslations();
  const sortable = useSortable({ id: item.key, disabled: !customizable });
  const itemProps = {
    ref: sortable.setNodeRef,
    className: cn(sortable.isDragging && "z-10 rounded-md bg-sidebar-accent shadow-md"),
    style: { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition },
    "data-sidebar-item": item.key,
    onClickCapture: (event: React.MouseEvent) => {
      if (!dropsClick()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    ...(customizable ? sortable.listeners : {}),
  };
  const label = t("SidebarCustomize.itemActions", { item: item.title });
  const menu = customizable && (
    <SidebarItemMenuItems
      hideable
      isShown={isShown}
      itemKey={item.key}
      resolved={resolved}
      targets={targets}
      onChange={onChange}
      onNewSection={onNewSection}
    />
  );
  const action = customizable && (
    <ItemActionsTrigger align="start" modal={false} side="right" tooltip={false} trigger={<SidebarMenuAction />} />
  );

  if (item.items && item.items.length > 0) {
    return (
      <NavMainParent
        action={action}
        actionsLabel={label}
        item={item}
        itemProps={itemProps}
        menu={menu}
        open={open}
        pathname={pathname}
        onNavigate={onNavigate}
        onOpenChange={onOpenChange}
      />
    );
  }

  return (
    <ItemActions href={item.href} label={label} menu={menu}>
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          asChild
          className={cn(customizable && NAV_ITEM_ACTION_PADDING)}
          isActive={isActive}
          tooltip={item.title}
        >
          <AppLink appearance="unstyled" href={item.href} id={`nav-${item.key}`} onClick={() => onNavigate(item.key)}>
            <NavLinkPendingIcon icon={item.icon} />

            <span className="min-w-0 truncate">{item.title}</span>

            <NavBadge count={item.badge ?? 0} />
          </AppLink>
        </SidebarMenuButton>

        {action}
      </SidebarMenuItem>
    </ItemActions>
  );
}

function SectionNameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const t = useTranslations();
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(commit ? value : null);
  };
  return (
    <SidebarInput
      autoFocus
      aria-label={t("SidebarCustomize.sectionName")}
      className="h-7"
      maxLength={SIDEBAR_SECTION_NAME_MAX}
      value={value}
      onBlur={() => finish(true)}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
        }
      }}
    />
  );
}

type SectionProps = {
  id: string;
  customizable: boolean;
  isShown: (key: string) => boolean;
  label: string;
  collapsed: boolean;
  editing: boolean;
  resolved: ResolvedSidebar;
  children: React.ReactNode;
  onChange: (next: ResolvedSidebar) => void;
  onEdit: (editing: boolean) => void;
  onDelete: () => void;
};

export function entryPosition(resolved: ResolvedSidebar, key: string, isShown: (key: string) => boolean) {
  const visible = resolved.entries.map(entryKey).filter((candidate) => candidate === key || isShown(candidate));
  const index = visible.indexOf(key);
  return { canMoveUp: index > 0, canMoveDown: index >= 0 && index < visible.length - 1 };
}

function NavSection({
  id,
  customizable,
  isShown,
  label,
  collapsed,
  editing,
  resolved,
  children,
  onChange,
  onEdit,
  onDelete,
}: SectionProps) {
  const t = useTranslations();
  const droppable = useDroppable({ id: SECTION_DROP_PREFIX + id });
  const key = SECTION_DROP_PREFIX + id;
  const position = entryPosition(resolved, key, isShown);

  return (
    <SidebarGroup data-sidebar-section={id} data-sidebar-section-label={label}>
      {!customizable ? (
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
      ) : editing ? (
        <SectionNameInput
          initial={label}
          onDone={(name) => {
            onEdit(false);
            const renamed = renameSidebarSection(resolved, id, name, label);
            if (renamed) onChange(renamed);
          }}
        />
      ) : (
        <ItemActions
          label={t("SidebarCustomize.sectionActions", { section: label })}
          menu={
            <>
              <DropdownMenuItem onSelect={() => onEdit(true)}>{t("SidebarCustomize.rename")}</DropdownMenuItem>

              <DropdownMenuItem
                disabled={!position.canMoveUp}
                onSelect={() => onChange(shiftSidebarEntry(resolved, key, -1, isShown))}
              >
                {t("SidebarCustomize.moveUp")}
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={!position.canMoveDown}
                onSelect={() => onChange(shiftSidebarEntry(resolved, key, 1, isShown))}
              >
                {t("SidebarCustomize.moveDown")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                {t("SidebarCustomize.deleteSection")}
              </DropdownMenuItem>
            </>
          }
        >
          <div className="relative" data-sidebar-section-header="">
            <SidebarGroupLabel
              ref={droppable.setNodeRef}
              asChild
              className={cn("group/section-label cursor-pointer pr-7", droppable.isOver && "bg-sidebar-accent")}
            >
              <button
                aria-expanded={!collapsed}
                type="button"
                onClick={() => onChange(updateSidebarSection(resolved, id, { collapsed: !collapsed }))}
              >
                <span className="min-w-0 truncate">{label}</span>

                <ChevronDown
                  aria-hidden
                  className={cn(
                    "ml-1 size-3 transition-transform",
                    collapsed ? "-rotate-90" : "opacity-0 group-hover/section-label:opacity-100",
                  )}
                />
              </button>
            </SidebarGroupLabel>

            <ItemActionsTrigger
              align="start"
              modal={false}
              side="right"
              tooltip={false}
              trigger={<SidebarGroupAction className="top-1.5 right-1" />}
            />
          </div>
        </ItemActions>
      )}

      <SidebarGroupContent className={cn(collapsed && "hidden group-data-[collapsible=icon]:block")}>
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

type Run =
  | { kind: "items"; key: string; items: string[] }
  | { kind: "section"; entry: SidebarEntry & { kind: "section" } };

function runsOf(entries: SidebarEntry[]): Run[] {
  const runs: Run[] = [];
  for (const entry of entries) {
    if (entry.kind === "section") {
      runs.push({ kind: "section", entry });
      continue;
    }
    const last = runs.at(-1);
    if (last?.kind === "items") last.items.push(entry.id);
    else runs.push({ kind: "items", key: `items:${entry.id}`, items: [entry.id] });
  }
  return runs;
}

export const NavSections = observer(({ groups, customizable, selectedKey, pathname, onNavigate }: Props) => {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const stored = useResolvedSidebar(groups);
  const [dragging, setDragging] = useState<ResolvedSidebar | null>(null);
  const { editingSection, setEditingSection } = sidebarLayoutStore;
  const deleteSection = useDeleteSidebarSection(groups);
  const dropClickUntil = useRef(0);
  const resolved = customizable ? (dragging ?? stored) : resolveSidebar(sidebarDefaults(groups), null);
  const items = useMemo(
    () => new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item]))),
    [groups],
  );
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

  const activeParentKey =
    [...items.values()].find((item) =>
      (item.items ?? []).some(
        (sub) => pathname !== null && (pathname === sub.href || pathname.startsWith(sub.href + "/")),
      ),
    )?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(activeParentKey);
  useEffect(() => {
    if (activeParentKey) setOpenKey(activeParentKey);
  }, [activeParentKey]);

  const isItemShown = (item: string) => items.has(item) && !resolved.hidden.has(item);
  const visibleItemsOf = (ids: string[]) => ids.filter(isItemShown);
  const isEntryShown = (key: string) => {
    if (!key.startsWith(SECTION_DROP_PREFIX)) return isItemShown(key);
    const section = sectionsOf(resolved).find((candidate) => SECTION_DROP_PREFIX + candidate.id === key);
    return Boolean(section && visibleItemsOf(section.items).length > 0);
  };
  const targets = moveTargets(groups, resolved, t("SidebarCustomize.topLevel"));
  const topLevelItems = resolved.entries.flatMap((entry) =>
    entry.kind === "item" && isItemShown(entry.id) ? [entry.id] : [],
  );

  function save(next: ResolvedSidebar) {
    runUserAction(() => sidebarLayoutStore.save(sidebarLayoutOf(next)));
  }

  function newSection(item: string) {
    const next = createSidebarSection(resolved, t("SidebarCustomize.newSectionName"), item);
    save(next.resolved);
    setEditingSection(next.id);
  }

  function targetOf(current: ResolvedSidebar, overId: string): { container: SidebarContainer; index?: number } | null {
    if (overId.startsWith(SECTION_DROP_PREFIX)) return { container: overId.slice(SECTION_DROP_PREFIX.length) };
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

  function handleDragStart(_event: DragStartEvent) {
    setDragging(stored);
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragging) return;
    const target = targetOf(dragging, String(over.id));
    const source = containerOf(dragging, String(active.id));
    if (!target || source === undefined || source === target.container) return;
    setDragging(moveSidebarItem(dragging, String(active.id), target.container, target.index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    dropClickUntil.current = Date.now() + 400;
    const current = dragging;
    setDragging(null);
    if (!current) return;
    let next = current;
    const target = over ? targetOf(current, String(over.id)) : null;
    const source = containerOf(current, String(active.id));
    if (target && source === target.container && target.index !== undefined)
      next = moveSidebarItem(current, String(active.id), target.container, target.index);
    if (JSON.stringify(sidebarLayoutOf(next)) !== JSON.stringify(sidebarLayoutOf(stored))) save(next);
  }

  function renderItem(key: string) {
    const item = items.get(key);
    if (!item) return null;
    return (
      <SortableNavItem
        key={key}
        customizable={customizable}
        dropsClick={() => Date.now() < dropClickUntil.current}
        isActive={selectedKey === key}
        isShown={isItemShown}
        item={item}
        open={openKey === key}
        pathname={pathname}
        resolved={resolved}
        targets={targets}
        onChange={save}
        onNavigate={onNavigate}
        onNewSection={newSection}
        onOpenChange={(next) => setOpenKey(next ? key : null)}
      />
    );
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragCancel={() => {
        dropClickUntil.current = Date.now() + 400;
        setDragging(null);
      }}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <SortableContext items={topLevelItems} strategy={verticalListSortingStrategy}>
        {runsOf(resolved.entries).map((run) => {
          if (run.kind === "items") {
            const keys = visibleItemsOf(run.items);
            if (keys.length === 0) return null;
            return (
              <SidebarGroup key={run.key} data-sidebar-top-level="">
                <SidebarGroupContent>
                  <SidebarMenu>{keys.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }
          const section = run.entry;
          const keys = visibleItemsOf(section.items);
          if (keys.length === 0 && editingSection !== section.id) return null;
          const label = sectionLabel(groups, section);
          return (
            <NavSection
              key={section.id}
              collapsed={customizable && section.collapsed}
              customizable={customizable}
              editing={editingSection === section.id}
              id={section.id}
              isShown={isEntryShown}
              label={label}
              resolved={resolved}
              onChange={save}
              onDelete={() => deleteSection(section.id, label)}
              onEdit={(editing) => setEditingSection(editing ? section.id : null)}
            >
              <SortableContext items={keys} strategy={verticalListSortingStrategy}>
                {keys.map(renderItem)}
              </SortableContext>
            </NavSection>
          );
        })}
      </SortableContext>
    </DndContext>
  );
});
