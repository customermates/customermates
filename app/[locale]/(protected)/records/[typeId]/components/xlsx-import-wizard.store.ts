import type { RecordDto, RecordModelView } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { RecordQueryResult } from "@/features/records/record-query-result.schema";
import type { XlsxTargetOption } from "@/features/data-transfer/import/xlsx/xlsx-mapping";
import type {
  XlsxImportMode,
  XlsxImportPort,
  XlsxImportSummary,
  XlsxIssue,
  XlsxLookups,
} from "@/features/data-transfer/import/xlsx/xlsx-import-plan";
import type { XlsxMember, XlsxRecordIndex } from "@/features/data-transfer/import/xlsx/xlsx-values";
import type { XlsxFileProblem, XlsxWorkbook } from "@/features/data-transfer/import/xlsx/xlsx-workbook";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import {
  autoMapXlsxColumns,
  duplicateXlsxTargets,
  normalizeXlsxHeader,
  xlsxTargetOptions,
  XLSX_SKIP_KEY,
} from "@/features/data-transfer/import/xlsx/xlsx-mapping";
import { parseXlsxRows, planXlsxImport, runXlsxImport } from "@/features/data-transfer/import/xlsx/xlsx-import-plan";
import { readXlsxWorkbook } from "@/features/data-transfer/import/xlsx/xlsx-workbook";

export type XlsxWizardStep = "file" | "mapping" | "preview" | "mode" | "result";

export const XLSX_WIZARD_STEPS: readonly XlsxWizardStep[] = ["file", "mapping", "preview", "mode", "result"];

export const XLSX_PREVIEW_ROWS = 10;

const QUERY_PAGE_SIZE = 500;

const QUERY_PAGE_LIMIT = 40;

const MEMBER_PAGE_SIZE = 100;

export type XlsxWizardPorts = {
  queryRecords: (query: RecordQuery) => Promise<{ ok: true; data: RecordQueryResult } | { ok: false }>;
  listMembers: (page: number, pageSize: 100) => Promise<{ members: XlsxMember[]; totalPages: number }>;
  importRecords: XlsxImportPort;
};

function recordTitle(record: RecordDto, fieldId: string | null): string | null {
  const result = record.fields.find((field) => field.fieldId === fieldId)?.result;
  if (result?.state !== "value") return null;
  const value = result.value;
  if (value.kind === "text" || value.kind === "select" || value.kind === "decimal") return value.value;
  if (value.kind === "textList") return value.value.join(", ");
  return null;
}

export class XlsxImportWizardStore {
  step: XlsxWizardStep = "file";
  fileName = "";
  workbook: XlsxWorkbook | null = null;
  sheetIndex = 0;
  mapping: string[] = [];
  problem: XlsxFileProblem | null = null;
  lookups: XlsxLookups | null = null;
  loading = false;
  mode: XlsxImportMode = "create";
  matchKey: string | null = null;
  processed = 0;
  total = 0;
  running = false;
  summary: XlsxImportSummary | null = null;
  failure: string | null = null;
  private generation = 0;

  constructor(
    private model: RecordModelView,
    private typeId: string,
    private labels: { recordId: string; assignedTo: string },
    private ports: XlsxWizardPorts,
  ) {
    makeObservable<XlsxImportWizardStore, "model">(this, {
      step: observable,
      fileName: observable,
      workbook: observable.ref,
      sheetIndex: observable,
      mapping: observable.ref,
      problem: observable,
      lookups: observable.ref,
      loading: observable,
      mode: observable,
      matchKey: observable,
      processed: observable,
      total: observable,
      running: observable,
      summary: observable.ref,
      failure: observable,
      model: observable.ref,
      sheet: computed,
      options: computed,
      duplicates: computed,
      previewRows: computed,
      matchChoices: computed,
      stepNumber: computed,
      canAdvance: computed,
      reset: action,
      setModel: action,
      selectSheet: action,
      setTarget: action,
      setMode: action,
      setMatchKey: action,
      back: action,
    });
  }

  get sheet() {
    return this.workbook?.sheets[this.sheetIndex] ?? null;
  }

  get options(): XlsxTargetOption[] {
    return xlsxTargetOptions(this.model, this.typeId, this.labels);
  }

  get duplicates(): string[] {
    return duplicateXlsxTargets(this.mapping);
  }

  get stepNumber() {
    return XLSX_WIZARD_STEPS.indexOf(this.step) + 1;
  }

  get previewRows() {
    const sheet = this.sheet;
    if (!sheet || !this.lookups) return [];
    const rows = sheet.rows.slice(0, XLSX_PREVIEW_ROWS);
    const parsed = parseXlsxRows(
      {
        model: this.model,
        typeId: this.typeId,
        headers: sheet.headers,
        rows,
        mapping: this.mapping,
        options: this.options,
        lookups: this.lookups,
      },
      rows,
    );
    return rows.map((row, index) => ({ row, issues: parsed[index]?.issues ?? [] }));
  }

  get matchChoices(): XlsxTargetOption[] {
    const fields = new Map(this.model.fields.map((field) => [field.id, field]));
    return this.options.filter((option) => {
      if (!this.mapping.includes(option.key)) return false;
      if (option.target.kind === "recordId") return true;
      if (option.target.kind !== "field") return false;
      const field = fields.get(option.target.fieldId);
      return Boolean(field && !field.multiple && ["text", "email", "phone", "url", "number"].includes(field.valueType));
    });
  }

  get canAdvance(): boolean {
    if (this.loading || this.running) return false;
    switch (this.step) {
      case "file":
        return Boolean(this.sheet);
      case "mapping":
        return this.duplicates.length === 0 && this.mapping.some((key) => key !== XLSX_SKIP_KEY);
      case "preview":
        return Boolean(this.lookups);
      case "mode":
        return (
          this.mode === "create" ||
          Boolean(this.matchKey && this.matchChoices.some((choice) => choice.key === this.matchKey))
        );
      case "result":
        return this.summary !== null;
    }
  }

  reset() {
    this.generation += 1;
    this.step = "file";
    this.fileName = "";
    this.workbook = null;
    this.sheetIndex = 0;
    this.mapping = [];
    this.problem = null;
    this.lookups = null;
    this.loading = false;
    this.mode = "create";
    this.matchKey = null;
    this.processed = 0;
    this.total = 0;
    this.running = false;
    this.summary = null;
    this.failure = null;
  }

  setModel(model: RecordModelView) {
    if (this.model.revision === model.revision) return;
    this.model = model;
    this.reset();
  }

  async load(name: string, buffer: Promise<ArrayBuffer>) {
    this.reset();
    const generation = this.generation;
    runInAction(() => {
      this.fileName = name;
      this.loading = true;
    });
    const result = await readXlsxWorkbook(await buffer).catch(() => ({
      ok: false as const,
      problem: "unreadable" as const,
    }));
    if (generation !== this.generation) return;
    runInAction(() => {
      this.loading = false;
      if (!result.ok) {
        this.problem = result.problem;
        return;
      }
      this.workbook = result.workbook;
      this.selectSheet(0);
    });
  }

  selectSheet(index: number) {
    const sheet = this.workbook?.sheets[index];
    if (!sheet) return;
    this.sheetIndex = index;
    this.mapping = autoMapXlsxColumns(sheet.headers, this.options);
    this.lookups = null;
  }

  setTarget(column: number, key: string) {
    const next = [...this.mapping];
    next[column] = key;
    this.mapping = next;
    this.lookups = null;
    if (this.matchKey && !next.includes(this.matchKey)) this.matchKey = null;
  }

  setMode(mode: XlsxImportMode) {
    this.mode = mode;
    if (mode === "update" && !this.matchKey) this.matchKey = this.defaultMatchKey();
  }

  setMatchKey(key: string) {
    this.matchKey = key;
  }

  back() {
    if (this.running) return;
    const index = XLSX_WIZARD_STEPS.indexOf(this.step);
    if (index > 0 && this.step !== "result") this.step = XLSX_WIZARD_STEPS[index - 1];
  }

  async advance(describeIssue: (issue: XlsxIssue) => string) {
    if (!this.canAdvance) return;
    if (this.step === "file") {
      runInAction(() => (this.step = "mapping"));
      return;
    }
    if (this.step === "mapping") {
      const generation = this.generation;
      runInAction(() => (this.loading = true));
      try {
        const lookups = await this.loadLookups();
        if (generation !== this.generation) return;
        runInAction(() => {
          this.lookups = lookups;
          this.step = "preview";
        });
      } finally {
        if (generation === this.generation) runInAction(() => (this.loading = false));
      }
      return;
    }
    if (this.step === "preview") {
      runInAction(() => {
        this.step = "mode";
        if (this.mode === "update" && !this.matchKey) this.matchKey = this.defaultMatchKey();
      });
      return;
    }
    if (this.step === "mode") await this.run(describeIssue);
  }

  private defaultMatchKey() {
    return (
      this.matchChoices.find((choice) => choice.target.kind === "recordId")?.key ?? this.matchChoices[0]?.key ?? null
    );
  }

  private async loadLookups(): Promise<XlsxLookups> {
    const targets = this.mapping.flatMap((key) => this.options.find((option) => option.key === key)?.target ?? []);
    const needsMembers = targets.some(
      (target) =>
        target.kind === "assignedTo" ||
        (target.kind === "field" &&
          this.model.fields.find((field) => field.id === target.fieldId)?.valueType === "member"),
    );
    const relations = new Map<string, XlsxRecordIndex | null>();
    const [members] = await Promise.all([
      needsMembers ? this.loadMembers() : Promise.resolve([]),
      ...targets.map(async (target) => {
        if (target.kind !== "relationship") return;
        relations.set(target.relationId, await this.loadIndex(target.targetTypeId));
      }),
    ]);
    return { members, relations };
  }

  private async loadMembers(): Promise<XlsxMember[] | null> {
    try {
      const members: XlsxMember[] = [];
      for (let page = 1; page <= QUERY_PAGE_LIMIT; page += 1) {
        const result = await this.ports.listMembers(page, MEMBER_PAGE_SIZE);
        members.push(...result.members);
        if (page >= result.totalPages) break;
      }
      return members;
    } catch {
      return null;
    }
  }

  private async loadRecords(
    typeId: string,
    fields?: string[],
  ): Promise<{ records: RecordDto[]; complete: boolean } | null> {
    const records: RecordDto[] = [];
    for (let page = 1; page <= QUERY_PAGE_LIMIT; page += 1) {
      const result = await this.ports.queryRecords({
        typeId,
        page,
        pageSize: QUERY_PAGE_SIZE,
        filters: [],
        relationships: [],
        sort: [],
        ...(fields ? { fields } : {}),
      });
      if (!result.ok) return null;
      records.push(...result.data.records);
      if (records.length >= result.data.total || result.data.records.length === 0) return { records, complete: true };
    }
    return { records, complete: false };
  }

  private async loadIndex(typeId: string): Promise<XlsxRecordIndex | null> {
    const primary = this.model.types.find((type) => type.id === typeId)?.primaryFieldId ?? null;
    const loaded = await this.loadRecords(typeId, primary ? [primary] : []);
    if (!loaded) return null;
    const index: XlsxRecordIndex = { byTitle: new Map(), byId: new Map(), complete: loaded.complete };
    for (const record of loaded.records) {
      index.byId.set(record.ref.recordId, record.ref);
      const title = recordTitle(record, primary);
      const key = title ? normalizeXlsxHeader(title) : "";
      if (key) index.byTitle.set(key, [...(index.byTitle.get(key) ?? []), record.ref]);
    }
    return index;
  }

  private async run(describeIssue: (issue: XlsxIssue) => string) {
    const sheet = this.sheet;
    const lookups = this.lookups;
    if (!sheet || !lookups) return;
    const generation = this.generation;
    runInAction(() => {
      this.step = "result";
      this.running = true;
      this.processed = 0;
      this.total = 0;
      this.summary = null;
      this.failure = null;
    });
    try {
      const existing = this.mode === "update" ? await this.loadRecords(this.typeId) : null;
      if (generation !== this.generation) return;
      if (this.mode === "update" && !existing) {
        runInAction(() => (this.failure = "lookup"));
        return;
      }
      const now = new Date().toISOString();
      const rows = planXlsxImport(
        {
          model: this.model,
          typeId: this.typeId,
          headers: sheet.headers,
          rows: sheet.rows,
          mapping: this.mapping,
          options: this.options,
          lookups,
        },
        this.mode,
        this.mode === "update" ? this.matchKey : null,
        existing,
        () => crypto.randomUUID(),
        now,
      );
      const summary = await runXlsxImport({
        rows,
        mode: this.mode,
        typeId: this.typeId,
        schemaRevision: this.model.revision,
        sessionKey: crypto.randomUUID(),
        now,
        importRecords: this.ports.importRecords,
        describeIssue,
        onProgress: (processed, total) => {
          if (generation !== this.generation) return;
          runInAction(() => {
            this.processed = processed;
            this.total = total;
          });
        },
      });
      if (generation !== this.generation) return;
      runInAction(() => {
        this.summary = summary;
      });
    } finally {
      if (generation === this.generation) runInAction(() => (this.running = false));
    }
  }
}
