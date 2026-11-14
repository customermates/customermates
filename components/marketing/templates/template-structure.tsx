import type { TemplateLocale, TemplateSpec } from "@/core/templates/template-spec.schema";

import { ChevronRight } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";

export type TemplateStructureLabels = {
  moreFields: (count: number) => string;
  stages: string;
  views: string;
  widgets: string;
};

type Props = {
  labels: TemplateStructureLabels;
  spec: TemplateSpec;
  text: TemplateLocale;
};

const VISIBLE_FIELDS = 9;

function fieldRefsOf(spec: TemplateSpec, listKey: string): string[] {
  const prefix = `${listKey}.`;
  const refs = [
    ...spec.stages.map((stage) => stage.field),
    ...spec.fields.map((field) => field.key),
    ...spec.calculations.map((calculation) => calculation.key),
  ].filter((ref) => ref.startsWith(prefix));
  return [...new Set(refs)];
}

function ListCard({ labels, listKey, spec, text }: Props & { listKey: string }) {
  const copy = text.lists[listKey];
  const refs = fieldRefsOf(spec, listKey);
  const shown = refs.slice(0, VISIBLE_FIELDS);
  const hidden = refs.length - shown.length;

  return (
    <li className="mk-card flex flex-col p-5" data-template-list={listKey}>
      <h3 className="text-base font-semibold">{copy.pluralLabel}</h3>

      {copy.description ? <p className="mt-1.5 text-sm leading-6 text-subdued">{copy.description}</p> : null}

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {shown.map((ref) => (
          <li key={ref}>
            <AppChip variant="secondary">{text.fields[ref]?.label ?? ref}</AppChip>
          </li>
        ))}

        {hidden > 0 ? (
          <li>
            <AppChip variant="secondary">{labels.moreFields(hidden)}</AppChip>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

function StageRow({ spec, stageIndex, text }: Pick<Props, "spec" | "text"> & { stageIndex: number }) {
  const stage = spec.stages[stageIndex];
  const copy = text.fields[stage.field];

  return (
    <li className="mk-card p-5" data-template-stage={stage.field}>
      <p className="mk-eyebrow">{copy?.label ?? stage.field}</p>

      <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
        {stage.items.map((item, index) => (
          <li key={item.key} className="inline-flex items-center gap-1">
            <AppChip variant="secondary">{copy?.options[item.key] ?? item.key}</AppChip>

            {index < stage.items.length - 1 ? (
              <ChevronRight aria-hidden className="size-3.5 text-subdued rtl:rotate-180" />
            ) : null}
          </li>
        ))}
      </ol>
    </li>
  );
}

export function TemplateStructure({ labels, spec, text }: Props) {
  const views = spec.views.map((view) => text.views[view.key]?.name ?? view.key);
  const widgets = spec.widgets.map((widget) => text.widgets[widget.key]?.title ?? widget.key);

  return (
    <div className="flex w-full flex-col gap-8" data-template-structure="">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {spec.lists.map((list) => (
          <ListCard key={list.key} labels={labels} listKey={list.key} spec={spec} text={text} />
        ))}
      </ul>

      {spec.stages.length > 0 ? (
        <section aria-label={labels.stages}>
          <ul className="grid grid-cols-1 gap-4">
            {spec.stages.map((stage, stageIndex) => (
              <StageRow key={stage.field} spec={spec} stageIndex={stageIndex} text={text} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="mk-card p-5">
          <h3 className="mk-eyebrow">{labels.views}</h3>

          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
            {views.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>

        <section className="mk-card p-5">
          <h3 className="mk-eyebrow">{labels.widgets}</h3>

          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
            {widgets.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
