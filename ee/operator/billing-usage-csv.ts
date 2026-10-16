import type { OperatorBillingUsageDto } from "./billing-usage.schema";

const COLUMNS = [
  "month",
  "workspace_id",
  "workspace",
  "workspace_deleted_at",
  "seats",
  "seats_complete",
  "peak_channels",
  "peak_channels_at",
  "channels_complete",
  "active_seats_now",
  "connected_channels_now",
] as const;

function csvCell(raw: string): string {
  const value = /^[=+@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function iso(value: Date | null): string {
  return value ? value.toISOString() : "";
}

export function billingUsageSummaryCsv(usage: OperatorBillingUsageDto): string {
  const lines = [
    COLUMNS.join(","),
    ...usage.workspaces.map((workspace) =>
      [
        usage.month,
        workspace.companyId,
        workspace.workspaceLabel,
        iso(workspace.deletedAt),
        String(workspace.seats.count),
        String(workspace.seats.coverage.complete),
        String(workspace.channels.peak),
        iso(workspace.channels.peakAt),
        String(workspace.channels.coverage.complete),
        String(workspace.current.activeSeats),
        String(workspace.current.connectedChannels),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  return `${lines.join("\n")}\n`;
}
