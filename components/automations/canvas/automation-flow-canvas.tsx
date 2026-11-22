"use client";

import "@xyflow/react/dist/style.css";

import type { Edge, EdgeProps, Node, NodeProps } from "@xyflow/react";
import type { AutomationCanvasActions, AutomationCanvasStep } from "./automation-canvas-types";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useReactFlow,
} from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { AutomationAddStep } from "./automation-add-step";
import { AutomationStepCard } from "./automation-step-card";
import { AutomationStepToolbar } from "./automation-step-toolbar";

const NODE_WIDTH = 288;
const QUICK_WIDTH = 384;
const ROW_GAP = 150;
const FIT_VIEW = { padding: 0.2, maxZoom: 1, minZoom: 0.6 };
const HANDLE_CLASS = "!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-border-strong";

type StepData = {
  step: AutomationCanvasStep;
  actions: AutomationCanvasActions;
  markLabel?: string;
  first: boolean;
};
type AddData = { index: number; actions: AutomationCanvasActions; quick: boolean };
type PlusData = {
  index: number;
  actions: AutomationCanvasActions;
  mark: AutomationCanvasStep["mark"];
};

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { step, actions, markLabel, first } = data;
  const selected = actions.selected === step.id;
  return (
    <>
      <NodeToolbar isVisible={selected} offset={12} position={Position.Right}>
        <AutomationStepToolbar actions={actions} step={step} />
      </NodeToolbar>

      {!first && <Handle className={HANDLE_CLASS} isConnectable={false} position={Position.Top} type="target" />}

      <div className="pointer-events-auto">
        <AutomationStepCard markLabel={markLabel} selected={selected} step={step} onSelect={actions.onSelect} />
      </div>

      <Handle className={HANDLE_CLASS} isConnectable={false} position={Position.Bottom} type="source" />
    </>
  );
}

function AddNode({ data }: NodeProps<Node<AddData>>) {
  return (
    <>
      <Handle className="!opacity-0" isConnectable={false} position={Position.Top} type="target" />

      <div className="pointer-events-auto">
        <AutomationAddStep actions={data.actions} index={data.index} quick={data.quick} variant="node" />
      </div>
    </>
  );
}

function PlusEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<PlusData>>) {
  const [path, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const mark = data?.mark ?? null;
  const stroke = mark === "ok" ? "var(--success)" : mark === "failed" ? "var(--destructive)" : "var(--border-strong)";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: 1.5,
          strokeDasharray: mark === "ok" || mark === "failed" ? undefined : "6 6",
        }}
      />

      {data && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <AutomationAddStep actions={data.actions} index={data.index} variant="edge" />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { step: StepNode, add: AddNode };
const EDGE_TYPES = { plus: PlusEdge };

function FlowControls() {
  const t = useTranslations();
  const flow = useReactFlow();
  const controls = [
    {
      label: t("RecordModel.graph.zoomIn"),
      icon: ZoomIn,
      run: () => flow.zoomIn(),
    },
    {
      label: t("RecordModel.graph.zoomOut"),
      icon: ZoomOut,
      run: () => flow.zoomOut(),
    },
    {
      label: t("RecordModel.graph.fitView"),
      icon: Maximize,
      run: () => flow.fitView(FIT_VIEW),
    },
  ];
  return (
    <Panel
      aria-label={t("RecordModel.graph.controls")}
      className="!m-3 flex flex-col gap-1"
      position="bottom-left"
      role="group"
    >
      {controls.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button
              aria-label={label}
              size="icon-sm"
              type="button"
              variant="secondary"
              onClick={() => runUserAction(run)}
            >
              <Icon aria-hidden="true" />
            </Button>
          </TooltipTrigger>

          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </Panel>
  );
}

function FitOnShapeChange({ shape }: { shape: string }) {
  const flow = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void flow.fitView(FIT_VIEW).catch(reportApplicationError));
    return () => cancelAnimationFrame(frame);
  }, [flow, shape]);
  return null;
}

function FlowCanvas({
  steps,
  actions,
  markLabel,
}: {
  steps: readonly AutomationCanvasStep[];
  actions: AutomationCanvasActions;
  markLabel: (step: AutomationCanvasStep) => string | undefined;
}) {
  const t = useTranslations();
  const { resolvedTheme } = useTheme();
  const showAdd = Boolean(actions.palette) && actions.editable;

  const { nodes, edges } = useMemo(() => {
    const builtNodes: Node[] = steps.map((step, index) => ({
      id: step.id,
      type: "step",
      position: { x: -NODE_WIDTH / 2, y: index * ROW_GAP },
      data: {
        step,
        actions,
        markLabel: markLabel(step),
        first: index === 0,
      } satisfies StepData,
      selectable: false,
    }));
    const builtEdges: Edge[] = steps.slice(1).map((step, offset) => ({
      id: `edge-${step.id}`,
      source: steps[offset].id,
      target: step.id,
      type: "plus",
      data: {
        index: offset + 1,
        actions,
        mark: step.mark ?? null,
      } satisfies PlusData,
    }));
    const last = steps[steps.length - 1];
    if (showAdd && last) {
      const quick = steps.length === 1;
      builtNodes.push({
        id: "add-step",
        type: "add",
        position: { x: -(quick ? QUICK_WIDTH : NODE_WIDTH) / 2, y: steps.length * ROW_GAP - 30 },
        data: { index: steps.length, actions, quick } satisfies AddData,
        selectable: false,
      });
      builtEdges.push({
        id: "edge-add-step",
        source: last.id,
        target: "add-step",
        style: {
          stroke: "var(--border-strong)",
          strokeWidth: 1.5,
          strokeDasharray: "6 6",
        },
      });
    }
    return { nodes: builtNodes, edges: builtEdges };
  }, [actions, markLabel, showAdd, steps]);

  const shape = `${steps.length}:${showAdd}`;

  return (
    <div
      aria-label={t("Automations.canvas.label")}
      className="relative h-full min-h-0"
      data-automation-canvas="flow"
      role="group"
    >
      <ReactFlow
        fitView
        panOnScroll
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        edgeTypes={EDGE_TYPES}
        edges={edges}
        edgesFocusable={false}
        fitViewOptions={FIT_VIEW}
        maxZoom={1.5}
        minZoom={0.4}
        nodeTypes={NODE_TYPES}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable={false}
        proOptions={{ hideAttribution: true }}
        zoomOnScroll={false}
        onPaneClick={() => actions.onSelect(null)}
      >
        <Background
          className="!bg-background"
          color="var(--border)"
          gap={18}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />

        <FlowControls />

        <FitOnShapeChange shape={shape} />
      </ReactFlow>
    </div>
  );
}

export function AutomationFlowCanvas(props: {
  steps: readonly AutomationCanvasStep[];
  actions: AutomationCanvasActions;
  markLabel: (step: AutomationCanvasStep) => string | undefined;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
