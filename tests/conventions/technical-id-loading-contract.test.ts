import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

describe("technical-id loading contract", () => {
  it("keys shell identities to the active entity and uses a breadcrumb skeleton", () => {
    const crumbs = read("app/components/app-topbar-crumbs.ts");
    const topbar = read("app/components/app-topbar.tsx");
    const detail = read("components/entity-detail/entity-detail-layout.tsx");

    expect(crumbs).toContain("runtimeIdentity.key === `${first}:${leaf}`");
    expect(crumbs).toContain('t("PageState.loading")');
    expect(crumbs).not.toMatch(/slice\(0,\s*8\)|label:\s*leaf/);
    expect(topbar).toContain("data-entity-crumb-loading");
    expect(topbar).toContain("<Skeleton");
    expect(crumbs).toContain("runtimeIdentity.key === inboxThreadId");
    expect(detail).toContain("resolveEntityDetailPageState");
    expect(detail).toContain('const showLoading = pageState === "loading"');
    expect(detail).toContain("layoutStore.setRuntimeIdentity");
  });

  it("guards entity hydration with a latest-request generation", () => {
    const store = read("core/base/base-custom-column-entity-modal.store.ts");
    const drawer = read("components/entity-detail/entity-drawer.tsx");
    const detail = read("components/entity-detail/entity-detail-layout.tsx");

    expect(store).toContain("entityLoadGeneration");
    expect(store).toContain("isCurrentRequest");
    expect(store).toContain("if (!isCurrentRequest()) return");
    expect(store).toContain("this.entityLoadGeneration !== generation");
    expect(drawer).toContain("resolveEntityDrawerPageState");
    expect(drawer).toContain("background={<EntityDetailDrawerSkeleton");
    expect(drawer).toContain('t("ErrorCard.retry")');
    expect(drawer).toContain("loadGate.isCurrent(attempt, activeKey)");
    expect(drawer).toContain("[activeKey, topEntityType, topId, rootStore, loadGate]");
    expect(drawer).not.toContain("}, [top, rootStore, loadGate]);");
    expect(detail).toContain("drawerWasOpen && !drawerIsOpen");
  });

  it("uses geometric pending states and never falls back to selected keys", () => {
    const autocomplete = read("components/forms/form-autocomplete.tsx");
    const select = read("components/forms/form-select.tsx");
    const filterSelect = read("components/data-view/filter-modal/inputs/filter-input-select.tsx");
    const filterChip = read("components/data-view/filter-modal/filter-chip-display.tsx");

    for (const source of [autocomplete, select, filterSelect]) {
      expect(source).toContain("SelectionValueSkeleton");
      expect(source).toContain("SelectionOptionsSkeleton");
      expect(source).toContain("Common.inputs.unavailableSelection");
    }
    expect(autocomplete).toContain("open && getItems");
    expect(filterSelect).toContain("!getItems || optionRequestKey === null");
    expect(filterSelect).not.toMatch(/textValue\s*\?\?\s*k/);
    expect(filterChip).toContain("requiresResolvedLabel");
    expect(filterChip).toContain("filterValueKind");
  });

  it("loads selected labels without exposing their keys and keeps request failures distinct from empty results", () => {
    const options = read("components/data-view/filter-modal/inputs/use-filter-select-items.tsx");
    const filterSelect = read("components/data-view/filter-modal/inputs/filter-input-select.tsx");
    const autocomplete = read("components/forms/form-autocomplete.tsx");

    expect(options).toContain("const result = await getItems({});");
    expect(options).toContain("requested.has(item.key)");
    expect(options).not.toContain("resolveFilterOptionsAction");
    expect(options).not.toContain("filters: [{ field, operator: FilterOperatorKey.in, value: ids }]");
    expect(options).toContain('status: "error"');
    expect(filterSelect).toContain("optionError");
    expect(filterSelect).toContain('t("ErrorCard.retry")');
    expect(autocomplete).toContain("!isCreating");
    expect(autocomplete).toContain('if (e.key === "Enter" && showCreate)');
    expect(autocomplete).toContain('t("ErrorCard.retry")');
  });

  it("keeps internal IDs as keys while removing them from customer-facing fallbacks", () => {
    expect(read("components/data-view/data-table.tsx")).toContain("row.index + 1");
    expect(read("components/data-view/data-kanban-view.tsx")).not.toContain("option?.label ?? key");
    expect(read("app/[locale]/(protected)/dashboard/components/widget-label.ts")).toContain("UUID_LABEL.test");
    expect(read("app/[locale]/(protected)/profile/components/account-folders.tsx")).not.toContain(
      "folder.name ?? folder.id",
    );
    expect(read("app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx")).not.toContain(
      "name ?? account.id",
    );
  });

  it("reuses the shared option skeleton in contextual async dropdowns", () => {
    for (const path of [
      "app/[locale]/(protected)/contacts/components/add-channel-popover.tsx",
      "app/[locale]/(protected)/inbox/components/thread-participants-contacts.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("SelectionOptionsSkeleton");
      expect(source, path).toContain("aria-busy");
    }

    const addChannel = read("app/[locale]/(protected)/contacts/components/add-channel-popover.tsx");
    expect(addChannel).toContain("{busy && <SelectionOptionsSkeleton");
    expect(addChannel).toContain("{!busy && candidates.length > 0");
    expect(addChannel).toContain("{!busy && addAsNewOptions.length === 1");
  });
});
