import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

describe("technical-id loading contract", () => {
  it("keys shell identities to the active entity and uses a breadcrumb skeleton", () => {
    const crumbs = read("app/components/app-topbar-crumbs.ts");
    const topbar = read("app/components/app-topbar.tsx");
    const detail = read("app/[locale]/(protected)/records/[typeId]/components/record-detail-page.tsx");
    expect(crumbs).toContain("runtimeIdentity.key === `records:${parts[1]}`");
    expect(crumbs).toContain('t("PageState.loading")');
    expect(crumbs).not.toMatch(/slice\(0,\s*8\)|label:\s*leaf/);
    expect(topbar).toContain("data-entity-crumb-loading");
    expect(topbar).toContain("<Skeleton");
    expect(crumbs).toContain("runtimeIdentity.key === inboxThreadId");
    expect(detail).toContain("layoutStore.setRuntimeIdentity");
    expect(detail).toContain("const key = `records:${initial.typeId}`");
  });

  it("guards record hydration and refresh against older requests and closing the drawer", () => {
    const store = read("core/stores/record-workspace.store.ts");
    const editor = read("app/[locale]/(protected)/records/[typeId]/components/record-editor.store.ts");
    const pending = read("components/records/workspace-record-editor.tsx");
    expect(store).toContain("const opening = ++this.opening");
    expect(store).toContain("if (opening !== this.opening || scope !== this.actorScope) return");
    expect(editor).toContain("generation !== this.refreshGeneration");
    expect(editor).toContain("protected override prepareToClose()");
    expect(editor).toContain("result.data.model.revision < this.presentation.model.revision");
    expect(editor).toContain("this.hasUnsavedChanges");
    expect(pending).toContain('t("PageState.loading")');
    expect(pending).toContain('role="status"');
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
    expect(autocomplete).toContain("const popoverOpen = canEdit && open");
    expect(autocomplete).toContain("popoverOpen && getItems");
    expect(filterSelect).toContain("!getItems || optionRequestKey === null");
    expect(filterSelect).not.toMatch(/textValue\s*\?\?\s*k/);
    expect(filterChip).toContain("requiresResolvedLabel");
    expect(filterChip).toContain("filterValueKind");
  });

  it("loads selected labels without exposing their keys and keeps request failures distinct from empty results", () => {
    const options = read("components/data-view/filter-modal/inputs/use-filter-select-items.tsx");
    const filterSelect = read("components/data-view/filter-modal/inputs/filter-input-select.tsx");
    const autocomplete = read("components/forms/form-autocomplete.tsx");
    const paletteSelect = read("components/data-view/filter-palette/palette-value-select.tsx");

    expect(options).toContain("SELF_IDENTIFYING_FILTER_FIELDS");
    expect(options).toContain("const selfIdentifyingField = SELF_IDENTIFYING_FILTER_FIELDS.has(fieldKey)");
    expect(options).toContain("field: selfIdentifyingField, operator: FilterOperatorKey.in");
    expect(options).toContain("requested.has(item.key)");
    expect(options).not.toContain("resolveFilterOptionsAction");
    expect(options).not.toContain("filters: [{ field, operator: FilterOperatorKey.in, value: ids }]");
    expect(options).not.toMatch(/field: fieldKey, operator: FilterOperatorKey\.in/);
    const selectedResolver = options.slice(options.indexOf("const getSelectedItems ="), options.indexOf("const resolveItems ="));
    expect(selectedResolver).not.toMatch(/pagination|pageSize/);
    expect(paletteSelect).not.toMatch(/pagination|pageSize/);
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
    expect(read("components/data-view/data-kanban-view.tsx")).not.toContain("options.options");
    expect(read("components/data-view/data-kanban-view.tsx")).not.toContain("KANBAN_EMPTY_GROUP_KEY");
    expect(read("app/[locale]/(protected)/dashboard/components/widget-label.ts")).toContain("UUID_LABEL.test");
    expect(read("app/[locale]/(protected)/profile/components/account-folders.tsx")).not.toContain(
      "folder.name ?? folder.id",
    );
    expect(read("app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx")).not.toContain(
      "name ?? account.id",
    );
  });

  it("reuses shared option skeletons for record relationships and inbox participants", () => {
    for (const path of [
      "app/[locale]/(protected)/records/[typeId]/components/record-relationship-editor.tsx",
      "app/[locale]/(protected)/inbox/components/thread-participants-contacts.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("SelectionOptionsSkeleton");
      expect(source, path).toContain("aria-busy");
    }
    const relationship = read("app/[locale]/(protected)/records/[typeId]/components/record-relationship-editor.tsx");
    expect(relationship).toContain("options.loading || search !== debounced");
    expect(relationship).toContain("options.failed");
    expect(relationship).toContain("state?.key === key");
  });
});
