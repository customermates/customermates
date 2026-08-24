import { SchematicEdge, SchematicFlow, SchematicFrame, SchematicNode, type SchematicProps } from "./schematic-grammar";
import { AppChip, Avatar, Card, CardContent } from "@/components/marketing/scenes/platform";

import { MCP_TOOL_COUNT } from "@/features/mcp-tools/tool-registry";

const LEON = { name: "Leon Becker", photo: "/demo/avatars/photos/leon-becker.png" };

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>

      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}

function MiniDeal({ stage, value }: { stage: string; value: string }) {
  return (
    <Card className="gap-2 py-3">
      <CardContent className="px-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Digital Customer Platform</div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="shrink-0 text-xs text-muted-foreground">Stage</span>

            <AppChip size="sm" variant="warning">
              {stage}
            </AppChip>
          </div>

          <MiniField label="Deal Value" value={value} />
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentOperatesCrm(props: SchematicProps) {
  return (
    <SchematicFrame {...props}>
      <SchematicFlow>
        <SchematicNode outside title="An AI client">
          <div className="rounded-xl border border-input bg-input-background p-3 font-mono text-sm text-muted-foreground">
            move the BMW deal to Proposal
          </div>
        </SchematicNode>

        <SchematicEdge label="MCP" />

        <SchematicNode title="Customermates">
          <div className="flex flex-wrap gap-1.5">
            <AppChip size="sm">{`${MCP_TOOL_COUNT} operations`}</AppChip>

            <AppChip size="sm">your permissions</AppChip>
          </div>
        </SchematicNode>

        <SchematicEdge label="writes" />

        <SchematicNode title="Your CRM">
          <MiniDeal stage="Proposal" value="€198,500.00" />
        </SchematicNode>
      </SchematicFlow>
    </SchematicFrame>
  );
}

export function AutomationNode(props: SchematicProps) {
  return (
    <SchematicFrame {...props}>
      <SchematicFlow>
        <SchematicNode outside title="A workflow node">
          <div className="rounded-xl border border-input bg-input-background p-3 font-mono text-sm text-muted-foreground">
            on schedule
          </div>
        </SchematicNode>

        <SchematicEdge label="calls" />

        <SchematicNode title="Customermates">
          <div className="flex flex-wrap gap-1.5">
            <AppChip size="sm">create task</AppChip>

            <AppChip size="sm">update deal</AppChip>
          </div>
        </SchematicNode>

        <SchematicEdge label="records" />

        <SchematicNode title="Your CRM">
          <MiniDeal stage="Negotiation" value="€212,000.00" />
        </SchematicNode>
      </SchematicFlow>
    </SchematicFrame>
  );
}

export function ConnectionAccepted(props: SchematicProps) {
  return (
    <SchematicFrame {...props}>
      <SchematicFlow>
        <SchematicNode outside title="Another platform">
          <div className="flex items-center gap-2">
            <Avatar name={LEON.name} size="lg" src={LEON.photo} />

            <span className="min-w-0 truncate text-sm">{LEON.name}</span>
          </div>
        </SchematicNode>

        <SchematicEdge label="relation.new" />

        <SchematicNode title="Customermates">
          <AppChip size="sm">matched to a contact</AppChip>
        </SchematicNode>

        <SchematicEdge label="activity" />

        <SchematicNode title="On the record">
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-xs">
            <span className="truncate text-sm font-medium">Connection accepted</span>

            <span className="text-xs text-muted-foreground">Leon Becker</span>
          </div>
        </SchematicNode>
      </SchematicFlow>
    </SchematicFrame>
  );
}

export function AgentDraftsHumanSends(props: SchematicProps) {
  return (
    <SchematicFrame {...props}>
      <SchematicFlow>
        <SchematicNode outside title="An AI client">
          <div className="rounded-xl border border-input bg-input-background p-3 font-mono text-sm text-muted-foreground">
            draft a reply to Leon
          </div>
        </SchematicNode>

        <SchematicEdge label="MCP" />

        <SchematicNode title="Waiting in the thread">
          <div className="flex flex-col gap-1 rounded-xl border border-dashed border-primary/30 bg-card p-3 text-sm">
            <span className="truncate">Happy to share the checklist today.</span>
          </div>
        </SchematicNode>

        <SchematicEdge label="you send" />

        <SchematicNode title="Sent by you">
          <div className="flex flex-col gap-1 rounded-xl bg-card p-3 text-sm shadow-xs">
            <span className="truncate">Happy to share the checklist today.</span>
          </div>
        </SchematicNode>
      </SchematicFlow>
    </SchematicFrame>
  );
}
