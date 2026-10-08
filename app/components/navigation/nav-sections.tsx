"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { NavGroup, NavItem } from "./nav-main";
import type { ResolvedSidebar } from "./sidebar-layout";

import { closestCenter, DndContext, MouseSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, MoreHorizontal } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLink } from "@/components/shared/app-link";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { SIDEBAR_SECTION_NAME_MAX } from "@/features/p13n/sidebar-layout.schema";

import { NavBadge, NavMainParent } from "./nav-main";
import { NavLinkPendingIcon } from "./nav-link-pending-icon";
import {
  CUSTOM_SECTION_PREFIX,
  addSidebarSection,
  isCustomSection,
  moveSidebarItem,
  removeSidebarSection,
  resolveSidebar,
  sectionOfItem,
  setSidebarItemHidden,
  shiftSidebarItem,
  shiftSidebarSection,
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

function defaultSections(groups: NavGroup[]) {
  return groups.map((group) => ({ id: group.key, items: group.items.map((item) => item.key) }));
}

export function useResolvedSidebar(groups: NavGroup[]) {
  const { sidebarLayoutStore } = useRootStore();
  const layout = sidebarLayoutStore.layout;
  return useMemo(() => resolveSidebar(defaultSections(groups), layout), [groups, layout]);
}

export function useDeleteSidebarSection(groups: NavGroup[]) {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const titles = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item.title])));
  const homes = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, group.label])));

  return (sectionId: string, label: string) => {
    const current = () => resolveSidebar(defaultSections(groups), sidebarLayoutStore.layout);
    const moving = (current().sections.find((section) => section.id === sectionId)?.items ?? []).filter((item) =>
      titles.has(item),
    );
    showConfirmation({
      title: t("SidebarCustomize.deleteSectionTitle", { section: label }),
      message: moving.length > 0 ? t("SidebarCustomize.deleteSectionMoves") : t("SidebarCustomize.deleteSectionEmpty"),
      details: moving.map((item) =>
        t("SidebarCustomize.movesBackTo", { item: titles.get(item) ?? item, section: homes.get(item) ?? "" }),
      ),
      confirmLabel: t("SidebarCustomize.deleteSection"),
      successKey: "SidebarCustomize.sectionDeleted",
      onConfirm: () => sidebarLayoutStore.save(sidebarLayoutOf(removeSidebarSection(current(), sectionId))),
    });
  };
}

export function useContextMenu() {
  const [open, setOpen] = useState(false);
  return {
    menu: { open, onOpenChange: setOpen },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    },
  };
}

export function sectionLabel(groups: NavGroup[], section: { id: string; name: string | null }) {
  return section.name ?? groups.find((group) => group.key === section.id)?.label ?? section.id;
}

export function createSidebarSection(resolved: ResolvedSidebar, baseName: string, item?: string) {
  const taken = new Set(resolved.sections.map((section) => section.name?.toLocaleLowerCase()));
  let name = baseName;
  for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1) name = `${baseName} ${index}`;
  const id = `${CUSTOM_SECTION_PREFIX}${crypto.randomUUID()}`;
  const after = item ? (sectionOfItem(resolved, item)?.id ?? "data") : "data";
  const next = addSidebarSection(resolved, id, name, after);
  return { id, resolved: item ? moveSidebarItem(next, item, id) : next };
}

type ItemProps = {
  item: NavItem;
  customizable: boolean;
  resolved: ResolvedSidebar;
  sectionNames: Array<{ id: string; label: string }>;
  isActive: boolean;
  open: boolean;
  pathname: string | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (next: string) => void;
  onChange: (next: ResolvedSidebar) => void;
  onNewSection: (item: string) => void;
  dropsClick: () => boolean;
};

function SortableNavItem({
  item,
  customizable,
  resolved,
  sectionNames,
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
  const section = sectionOfItem(resolved, item.key);
  const visible = section?.items.filter((candidate) => !resolved.hidden.has(candidate)) ?? [];
  const index = visible.indexOf(item.key);
  const contextMenu = useContextMenu();
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
    ...(customizable ? { ...sortable.listeners, onContextMenu: contextMenu.onContextMenu } : {}),
  };
  const action = customizable && (
    <DropdownMenu modal={false} {...contextMenu.menu}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction showOnHover aria-label={t("SidebarCustomize.itemActions", { item: item.title })}>
          <MoreHorizontal />
        </SidebarMenuAction>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="right">
        <DropdownMenuItem disabled={index <= 0} onSelect={() => onChange(shiftSidebarItem(resolved, item.key, -1))}>
          {t("SidebarCustomize.moveUp")}
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={index < 0 || index >= visible.length - 1}
          onSelect={() => onChange(shiftSidebarItem(resolved, item.key, 1))}
        >
          {t("SidebarCustomize.moveDown")}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("SidebarCustomize.moveToSection")}</DropdownMenuSubTrigger>

          <DropdownMenuSubContent>
            {sectionNames
              .filter((candidate) => candidate.id !== section?.id)
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

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => onChange(setSidebarItemHidden(resolved, item.key, true))}>
          {t("SidebarCustomize.hide")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (item.items && item.items.length > 0) {
    return (
      <NavMainParent
        action={action}
        item={item}
        itemProps={itemProps}
        open={open}
        pathname={pathname}
        onNavigate={onNavigate}
        onOpenChange={onOpenChange}
      />
    );
  }

  return (
    <SidebarMenuItem {...itemProps}>
      <SidebarMenuButton
        asChild
        className={cn(
          customizable && "pr-8 md:pr-2 md:group-focus-within/menu-item:pr-8 md:group-hover/menu-item:pr-8",
        )}
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
  );
}

function SectionNameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const t = useTranslations();
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(commit && value.trim() ? value.trim() : null);
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
  shown: ReadonlySet<string>;
  label: string;
  index: number;
  count: number;
  custom: boolean;
  collapsed: boolean;
  editing: boolean;
  empty: boolean;
  resolved: ResolvedSidebar;
  children: React.ReactNode;
  onChange: (next: ResolvedSidebar) => void;
  onEdit: (editing: boolean) => void;
  onDelete: () => void;
};

function NavSection({
  id,
  customizable,
  shown,
  label,
  index,
  count,
  custom,
  collapsed,
  editing,
  empty,
  resolved,
  children,
  onChange,
  onEdit,
  onDelete,
}: SectionProps) {
  const t = useTranslations();
  const droppable = useDroppable({ id: SECTION_DROP_PREFIX + id });
  const contextMenu = useContextMenu();

  return (
    <SidebarGroup data-sidebar-section={id} data-sidebar-section-label={label}>
      {!customizable ? (
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
      ) : editing ? (
        <SectionNameInput
          initial={label}
          onDone={(name) => {
            onEdit(false);
            if (name && name !== label) onChange(updateSidebarSection(resolved, id, { name }));
          }}
        />
      ) : (
        <SidebarGroupLabel
          ref={droppable.setNodeRef}
          asChild
          className={cn("group/section-label cursor-pointer pr-7", droppable.isOver && "bg-sidebar-accent")}
        >
          <button
            aria-expanded={!collapsed}
            type="button"
            onClick={() => onChange(updateSidebarSection(resolved, id, { collapsed: !collapsed }))}
            onContextMenu={contextMenu.onContextMenu}
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
      )}

      {customizable && !editing && (
        <DropdownMenu modal={false} {...contextMenu.menu}>
          <DropdownMenuTrigger asChild>
            <SidebarGroupAction
              aria-label={t("SidebarCustomize.sectionActions", { section: label })}
              className="md:opacity-0 group-hover/sidebar-group:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </SidebarGroupAction>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="right">
            {custom && (
              <DropdownMenuItem onSelect={() => onEdit(true)}>{t("SidebarCustomize.rename")}</DropdownMenuItem>
            )}

            <DropdownMenuItem
              disabled={index === 0}
              onSelect={() => onChange(shiftSidebarSection(resolved, id, -1, shown))}
            >
              {t("SidebarCustomize.moveUp")}
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={index === count - 1}
              onSelect={() => onChange(shiftSidebarSection(resolved, id, 1, shown))}
            >
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
      )}

      <SidebarGroupContent className={cn(collapsed && "hidden group-data-[collapsible=icon]:block")}>
        <SidebarMenu>
          {children}

          {empty && (
            <li className="px-2 py-1 text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
              {t("SidebarCustomize.emptySection")}
            </li>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export const NavSections = observer(({ groups, customizable, selectedKey, pathname, onNavigate }: Props) => {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const stored = useResolvedSidebar(groups);
  const [dragging, setDragging] = useState<ResolvedSidebar | null>(null);
  const { editingSection, setEditingSection } = sidebarLayoutStore;
  const deleteSection = useDeleteSidebarSection(groups);
  const dropClickUntil = useRef(0);
  const resolved = customizable ? (dragging ?? stored) : resolveSidebar(defaultSections(groups), null);
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

  const visibleItems = (sectionId: string) =>
    (resolved.sections.find((section) => section.id === sectionId)?.items ?? []).filter(
      (item) => !resolved.hidden.has(item) && items.has(item),
    );
  const sectionNames = resolved.sections.map((section) => ({ id: section.id, label: sectionLabel(groups, section) }));

  function save(next: ResolvedSidebar) {
    runUserAction(() => sidebarLayoutStore.save(sidebarLayoutOf(next)));
  }

  function newSection(item: string) {
    const next = createSidebarSection(resolved, t("SidebarCustomize.newSectionName"), item);
    save(next.resolved);
    setEditingSection(next.id);
  }

  function targetOf(current: ResolvedSidebar, overId: string): { section: string; index?: number } | null {
    if (overId.startsWith(SECTION_DROP_PREFIX)) return { section: overId.slice(SECTION_DROP_PREFIX.length) };
    const section = sectionOfItem(current, overId);
    return section ? { section: section.id, index: section.items.indexOf(overId) } : null;
  }

  function handleDragStart(_event: DragStartEvent) {
    setDragging(stored);
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragging) return;
    const target = targetOf(dragging, String(over.id));
    const source = sectionOfItem(dragging, String(active.id));
    if (!target || !source || source.id === target.section) return;
    setDragging(moveSidebarItem(dragging, String(active.id), target.section, target.index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    dropClickUntil.current = Date.now() + 400;
    const current = dragging;
    setDragging(null);
    if (!current) return;
    let next = current;
    const target = over ? targetOf(current, String(over.id)) : null;
    const source = sectionOfItem(current, String(active.id));
    if (target && source && source.id === target.section && target.index !== undefined)
      next = moveSidebarItem(current, String(active.id), target.section, target.index);
    if (JSON.stringify(sidebarLayoutOf(next)) !== JSON.stringify(sidebarLayoutOf(stored))) save(next);
  }

  const rendered = resolved.sections.filter(
    (section) => isCustomSection(section.id) || visibleItems(section.id).length > 0,
  );
  const shownSections = new Set(rendered.map((section) => section.id));

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
      {rendered.map((section, index) => {
        const custom = isCustomSection(section.id);
        const keys = visibleItems(section.id);
        return (
          <NavSection
            key={section.id}
            collapsed={customizable && section.collapsed}
            count={rendered.length}
            custom={custom}
            customizable={customizable}
            editing={editingSection === section.id}
            empty={keys.length === 0}
            id={section.id}
            index={index}
            label={sectionLabel(groups, section)}
            resolved={resolved}
            shown={shownSections}
            onChange={save}
            onDelete={() => deleteSection(section.id, sectionLabel(groups, section))}
            onEdit={(editing) => setEditingSection(editing ? section.id : null)}
          >
            <SortableContext items={keys} strategy={verticalListSortingStrategy}>
              {keys.map((key) => {
                const item = items.get(key);
                if (!item) return null;
                return (
                  <SortableNavItem
                    key={key}
                    customizable={customizable}
                    dropsClick={() => Date.now() < dropClickUntil.current}
                    isActive={selectedKey === key}
                    item={item}
                    open={openKey === key}
                    pathname={pathname}
                    resolved={resolved}
                    sectionNames={sectionNames}
                    onChange={save}
                    onNavigate={onNavigate}
                    onNewSection={newSection}
                    onOpenChange={(next) => setOpenKey(next ? key : null)}
                  />
                );
              })}
            </SortableContext>
          </NavSection>
        );
      })}
    </DndContext>
  );
});
