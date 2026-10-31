import type { LookupFunction } from "node:net";
import type { WebhookDestination } from "./webhook-destination";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { normalizeWebhookHostname } from "./webhook-destination";

export type WebhookResponse = { statusCode: number; statusMessage: string };

type SingleLookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;

export function pinnedLookup(destination: WebhookDestination): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) return callback(null, destination.addresses);

    (callback as unknown as SingleLookupCallback)(null, destination.address, destination.family);
  };
}

export function sendPinnedWebhookRequest(args: {
  url: URL;
  destination: WebhookDestination;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}): Promise<WebhookResponse> {
  const hostname = normalizeWebhookHostname(args.url.hostname);
  const send = args.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = send(
      {
        protocol: args.url.protocol,
        hostname,
        port: args.url.port || undefined,
        path: `${args.url.pathname}${args.url.search}`,
        method: "POST",
        agent: false,
        signal: args.signal,
        lookup: pinnedLookup(args.destination),
        servername: isIP(hostname) ? undefined : hostname,
        headers: { ...args.headers, "Content-Length": String(Buffer.byteLength(args.body)) },
      },
      (response) => {
        resolve({ statusCode: response.statusCode ?? 0, statusMessage: response.statusMessage ?? "" });
        response.destroy();
      },
    );

    request.on("error", reject);
    request.end(args.body);
  });
}
