import path from "path";

import { defineConfig } from "vitest/config";

const aliases = {
  "@": path.resolve(__dirname, "."),
  "@api": path.resolve(__dirname, "./app/api"),
  "server-only": path.resolve(__dirname, "./tests/helpers/server-only.ts"),
};
const testEnvironment = {
  APP_MODE: "self-hosted",
  BASE_URL: "http://localhost:4000",
  BETTER_AUTH_SECRET: "vitest-secret",
};
const domTestFiles = [
  "app/**/company/components/company-settings/__tests__/company-settings-form.test.ts",
  "app/**/dashboard/components/__tests__/widget-chart.test.ts",
  "app/[locale]/(protected)/__tests__/protected-layout.test.ts",
  "app/components/agent-chat/__tests__/use-activity-group-state.test.ts",
  "app/components/agent-chat/__tests__/agent-route-reload.integration.test.ts",
  "app/components/__tests__/shell-header.test.ts",
  "app/components/navigation/__tests__/navigation-switch.test.ts",
  "app/components/navigation/__tests__/public-navbar-menu.test.ts",
  "core/base/__tests__/data-view-override-persistence.test.ts",
  "core/base/__tests__/base-data-view-clear-grouping.test.ts",
  "core/base/__tests__/grouped-merge.test.ts",
  "core/base/__tests__/base-data-view-view-mode-race.test.ts",
  "core/base/__tests__/persist-view-options-rejection.test.ts",
  "core/utils/__tests__/clipboard.test.ts",
  "features/data-transfer/__tests__/export-action-stability.test.ts",
  "features/data-transfer/__tests__/export-requested-columns.test.ts",
  "core/utils/__tests__/use-is-truncated.test.ts",
  "components/data-view/__tests__/is-interactive-click.test.ts",
  "components/data-view/__tests__/data-table-grouping.test.tsx",
  "components/data-view/__tests__/data-kanban-order.test.tsx",
  "components/data-view/__tests__/board-drag-gating.test.tsx",
  "components/data-view/__tests__/data-view-url-sync.test.ts",
  "components/data-view/__tests__/data-view-views-rail-interaction.test.ts",
  "components/data-view/__tests__/use-data-view-sync.test.ts",
  "components/data-view/filter-modal/inputs/__tests__/filter-input-number.test.ts",
  "components/data-view/filter-palette/__tests__/filter-palette-keyboard.test.tsx",
  "components/data-view/filter-palette/__tests__/filter-palette-pages.test.tsx",
  "components/entity-detail/__tests__/entity-detail-custom-fields-empty.test.ts",
  "components/entity-detail/__tests__/entity-detail-personalization.test.ts",
  "components/entity-detail/__tests__/entity-detail-summary.test.ts",
  "components/entity-detail/__tests__/entity-detail-visibility.test.tsx",
  "components/entity-detail/__tests__/entity-drawer-personalization.test.ts",
  "components/entity-detail/__tests__/use-entity-detail-server-snapshot.test.ts",
  "components/forms/__tests__/form-context.test.ts",
  "components/forms/__tests__/selection-command.test.ts",
  "components/modal/__tests__/delete-confirmation-modal.test.ts",
  "components/acquisition/__tests__/public-ad-attribution-consent.test.ts",
  "components/scroll/__tests__/messages-scroll-container.test.ts",
  "components/shared/__tests__/overflow-rail.test.ts",
  "components/shared/__tests__/unexpected-error-toaster.test.ts",
  "core/stores/__tests__/root-store-provider.test.ts",
  "core/stores/__tests__/use-hydrated-intl-store.test.ts",
  "features/messaging/activities/__tests__/use-owned-activities-store.test.ts",
];

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
    exclude: ["node_modules", ".next", "generated"],
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          env: testEnvironment,
          include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
          exclude: ["node_modules", ".next", "generated", ...domTestFiles],
          server: { deps: { inline: [/next-intl/] } },
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: "dom",
          globals: true,
          environment: "jsdom",
          env: testEnvironment,
          include: domTestFiles,
          exclude: ["node_modules", ".next", "generated"],
        },
      },
    ],
    env: testEnvironment,
  },
  resolve: {
    alias: aliases,
  },
});
