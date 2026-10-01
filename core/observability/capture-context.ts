import type { ErrorReport } from "./error-report";

export type CaptureContext = {
  level?: ErrorReport["level"];
  user?: { id?: string } | null;
  tags?: Record<string, string | number | boolean | undefined>;
  contexts?: Record<string, Record<string, unknown> | null>;
  path?: string;
  digest?: string;
  frames?: ErrorReport["frames"];
  extra?: Record<string, unknown>;
};
