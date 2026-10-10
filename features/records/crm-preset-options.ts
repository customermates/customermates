type DefaultSelectColumn = {
  entityType: "contact" | "deal" | "task";
  options: { key: string; color: string; weight?: number }[];
};

export const DEFAULT_SELECT_COLUMNS: DefaultSelectColumn[] = [
  {
    entityType: "contact",
    options: [
      { key: "new", color: "secondary" },
      { key: "contact", color: "info" },
      { key: "qualified", color: "info" },
      { key: "inProgress", color: "warning" },
      { key: "won", color: "success" },
      { key: "lost", color: "destructive" },
    ],
  },
  {
    entityType: "deal",
    options: [
      { key: "prospecting", color: "secondary", weight: 10 },
      { key: "qualification", color: "info", weight: 20 },
      { key: "demo", color: "info", weight: 40 },
      { key: "proposal", color: "warning", weight: 60 },
      { key: "negotiation", color: "warning", weight: 80 },
      { key: "won", color: "success", weight: 100 },
      { key: "lost", color: "destructive", weight: 0 },
    ],
  },
  {
    entityType: "task",
    options: [
      { key: "open", color: "secondary" },
      { key: "inProgress", color: "warning" },
      { key: "blocked", color: "destructive" },
      { key: "onHold", color: "secondary" },
      { key: "done", color: "success" },
      { key: "archived", color: "secondary" },
    ],
  },
] as const;
