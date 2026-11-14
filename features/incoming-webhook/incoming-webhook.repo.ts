import type { IncomingWebhookMapping, IncomingWebhookOutcome } from "./incoming-webhook.schema";

export type StoredIncomingWebhook = {
  id: string;
  typeId: string;
  name: string;
  createdById: string;
  enabled: boolean;
  tokenVersion: number;
  signingSecret: string | null;
  signatureHeader: string;
  mapping: unknown;
  samplePayload: unknown;
  lastReceivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredIncomingDelivery = {
  id: string;
  outcome: string;
  statusCode: number;
  message: string | null;
  recordId: string | null;
  payloadBytes: number;
  payload: unknown;
  createdAt: Date;
};

export type IncomingWebhookCreate = {
  typeId: string;
  name: string;
  enabled: boolean;
  signingSecret: string | null;
  signatureHeader: string;
  mapping: IncomingWebhookMapping;
  samplePayload: unknown;
};

export type IncomingWebhookPatch = {
  name?: string;
  enabled?: boolean;
  signingSecret?: string | null;
  signatureHeader?: string;
  mapping?: IncomingWebhookMapping;
  samplePayload?: unknown;
  rotateToken?: boolean;
};

export type NewIncomingDelivery = {
  webhookId: string;
  outcome: IncomingWebhookOutcome;
  statusCode: number;
  message: string | null;
  recordId: string | null;
  payloadBytes: number;
  payload: unknown;
};

export abstract class IncomingWebhookRepo {
  abstract findWebhook(id: string): Promise<StoredIncomingWebhook | null>;
  abstract listWebhooks(typeId?: string): Promise<StoredIncomingWebhook[]>;
  abstract createWebhook(data: IncomingWebhookCreate): Promise<StoredIncomingWebhook>;
  abstract updateWebhook(id: string, patch: IncomingWebhookPatch): Promise<StoredIncomingWebhook>;
  abstract deleteWebhook(id: string): Promise<boolean>;
  abstract listDeliveries(webhookId: string, limit: number): Promise<StoredIncomingDelivery[]>;
  abstract recordDelivery(delivery: NewIncomingDelivery, retentionDays: number): Promise<{ id: string }>;
}
