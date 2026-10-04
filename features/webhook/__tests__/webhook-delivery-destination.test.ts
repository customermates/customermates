import type * as Http from "node:http";
import type * as Https from "node:https";
import type { IncomingMessage, RequestOptions, Server } from "node:http";
import type { AddressInfo } from "node:net";

import { EventEmitter } from "node:events";
import { createServer } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
    NODE_ENV: "test",
    WEBHOOK_ALLOW_PRIVATE_DESTINATIONS: false,
    WEBHOOK_BLOCK_PRIVATE_DESTINATIONS: false,
  },
  lookup: vi.fn(),
  fakeHttp: null as null | ((options: RequestOptions) => void),
  fakeHttps: null as null | ((options: RequestOptions) => void),
}));

vi.mock("@/env", () => ({ env: state.env }));
vi.mock("node:dns/promises", () => ({ lookup: state.lookup, default: { lookup: state.lookup } }));

function fakeRequest(capture: (options: RequestOptions) => void) {
  return (options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
    capture(options);
    const request = new EventEmitter() as EventEmitter & { end: (body: string) => void };
    request.end = () => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        statusMessage: "OK",
        resume: () => undefined,
        destroy: () => undefined,
      });
      queueMicrotask(() => onResponse(response as unknown as IncomingMessage));
    };
    return request;
  };
}

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof Http>();
  const request = ((...args: Parameters<typeof actual.request>) =>
    state.fakeHttp
      ? fakeRequest(state.fakeHttp)(args[0] as RequestOptions, args[1] as (response: IncomingMessage) => void)
      : actual.request(...args)) as typeof actual.request;
  return { ...actual, request, default: { ...actual, request } };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof Https>();
  const request = ((...args: Parameters<typeof actual.request>) =>
    state.fakeHttps
      ? fakeRequest(state.fakeHttps)(args[0] as RequestOptions, args[1] as (response: IncomingMessage) => void)
      : actual.request(...args)) as typeof actual.request;
  return { ...actual, request, default: { ...actual, request } };
});

import { DeliverWebhookInteractor } from "../deliver-webhook.interactor";

type Received = { url: string | undefined; host: string | undefined; userAgent?: string };

const DELIVERY_ID = "00000000-0000-4000-8000-000000000001";
const COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const ENVELOPE = { event: "contact.created", data: { entityId: "e-1" }, timestamp: "2026-01-01T00:00:00.000Z" };

let server: Server;
let port: number;
let received: Received[] = [];
let slowClosed = false;

const repo = { markSuccessUnscoped: vi.fn(), markFailedUnscoped: vi.fn() };
const configRepo = {
  getDeliveryConfigUnscoped: vi.fn(() =>
    Promise.resolve({ secret: null, headers: {}, bodyTemplate: null, ambiguous: false }),
  ),
};

function deliver(url: string) {
  return new DeliverWebhookInteractor(repo, configRepo).invoke({
    deliveryId: DELIVERY_ID,
    companyId: COMPANY_ID,
    url,
    requestBody: ENVELOPE,
  });
}

function lookupCall(lookup: unknown, all: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    (lookup as (host: string, options: object, cb: (...args: unknown[]) => void) => void)(
      "rebind.example.com",
      { all },
      (error, address, family) => (error ? reject(error as Error) : resolve(all ? address : { address, family })),
    );
  });
}

beforeAll(async () => {
  server = createServer((request, response) => {
    received.push({ url: request.url, host: request.headers.host, userAgent: request.headers["user-agent"] });
    request.resume();
    if (request.url === "/slow") {
      response.writeHead(200, { "Content-Type": "application/json" });
      const timer = setInterval(() => response.write(" "), 100);
      response.on("close", () => {
        clearInterval(timer);
        slowClosed = true;
      });
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: `http://127.0.0.1:${port}/landing` });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  state.env.APP_MODE = "cloud";
  state.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = false;
  state.env.WEBHOOK_BLOCK_PRIVATE_DESTINATIONS = false;
  state.fakeHttp = null;
  state.fakeHttps = null;
  state.lookup.mockReset();
  repo.markSuccessUnscoped.mockReset();
  repo.markFailedUnscoped.mockReset();
});

describe("webhook delivery destinations in cloud mode", () => {
  it.each([
    (p: number) => `http://127.0.0.1:${p}/hook`,
    (p: number) => `http://2130706433:${p}/hook`,
    (p: number) => `http://0x7f.1:${p}/hook`,
    (p: number) => `http://[::ffff:127.0.0.1]:${p}/hook`,
    (p: number) => `http://localhost:${p}/hook`,
  ])("refuses a loopback destination without connecting (%#)", async (build) => {
    const url = build(port);
    const outcome = await deliver(url);

    expect(outcome).toEqual({ status: "failed", statusCode: 422, responseMessage: "Destination not allowed" });
    expect(received).toHaveLength(0);
    expect(state.lookup).not.toHaveBeenCalled();
    expect(repo.markFailedUnscoped).toHaveBeenCalledWith({
      id: DELIVERY_ID,
      companyId: COMPANY_ID,
      statusCode: 422,
      responseMessage: "Destination not allowed",
    });
  });

  it.each(["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5:8080/admin", "http://[fd00::1]/x"])(
    "refuses %s with a message that names neither host nor port",
    async (url) => {
      state.fakeHttp = vi.fn();

      const outcome = await deliver(url);

      expect(outcome.responseMessage).toBe("Destination not allowed");
      expect(state.fakeHttp).not.toHaveBeenCalled();
    },
  );

  it("refuses a hostname whose records mix public and private addresses", async () => {
    state.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    state.fakeHttp = vi.fn();

    const outcome = await deliver(`http://mixed.example.com:${port}/hook`);

    expect(outcome).toMatchObject({ status: "failed", statusCode: 422, responseMessage: "Destination not allowed" });
    expect(state.fakeHttp).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("pins the connection to the validated address when DNS later rebinds to a private one", async () => {
    state.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const captured: RequestOptions[] = [];
    state.fakeHttp = (options) => captured.push(options);

    const outcome = await deliver("http://rebind.example.com/hook");

    expect(outcome.status).toBe("success");
    expect(state.lookup).toHaveBeenCalledTimes(1);
    expect(captured).toHaveLength(1);
    expect(captured[0].hostname).toBe("rebind.example.com");
    expect(captured[0].agent).toBe(false);
    expect(Object.keys(captured[0].headers ?? {}).map((name) => name.toLowerCase())).not.toContain("host");
    await expect(lookupCall(captured[0].lookup, true)).resolves.toEqual([{ address: "93.184.216.34", family: 4 }]);
    await expect(lookupCall(captured[0].lookup, false)).resolves.toEqual({ address: "93.184.216.34", family: 4 });
    expect(state.lookup).toHaveBeenCalledTimes(1);
  });

  it("closes the connection once the status arrives instead of draining an endless body", async () => {
    state.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = true;
    slowClosed = false;
    const started = Date.now();

    const outcome = await deliver(`http://127.0.0.1:${port}/slow`);

    expect(outcome.status).toBe("success");
    expect(Date.now() - started).toBeLessThan(2000);
    await vi.waitFor(() => expect(slowClosed).toBe(true), { timeout: 2000 });
  });

  it("offers every validated address to the connection so a failing first address can fall back", async () => {
    state.lookup.mockResolvedValueOnce([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const captured: RequestOptions[] = [];
    state.fakeHttp = (options) => captured.push(options);

    const outcome = await deliver("http://dual.example.com/hook");

    expect(outcome.status).toBe("success");
    await expect(lookupCall(captured[0].lookup, true)).resolves.toEqual([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(state.lookup).toHaveBeenCalledTimes(1);
  });

  it("delivers to a public HTTPS host with the original host name for Host and SNI", async () => {
    state.lookup.mockResolvedValueOnce([{ address: "2606:4700:4700::1111", family: 6 }]);
    const captured: RequestOptions[] = [];
    state.fakeHttps = (options) => captured.push(options);

    const outcome = await deliver("https://hooks.example.com:8443/in?x=1");

    expect(outcome).toEqual({ status: "success", statusCode: 200, responseMessage: "OK" });
    expect(captured[0]).toMatchObject({
      protocol: "https:",
      hostname: "hooks.example.com",
      port: "8443",
      path: "/in?x=1",
      servername: "hooks.example.com",
      method: "POST",
    });
    await expect(lookupCall(captured[0].lookup, false)).resolves.toEqual({
      address: "2606:4700:4700::1111",
      family: 6,
    });
  });

  it("allows private destinations when WEBHOOK_ALLOW_PRIVATE_DESTINATIONS is set", async () => {
    state.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = true;

    const outcome = await deliver(`http://127.0.0.1:${port}/hook`);

    expect(outcome.status).toBe("success");
    expect(received).toEqual([{ url: "/hook", host: `127.0.0.1:${port}`, userAgent: "node" }]);
  });

  it("connects to the resolved address while keeping the original Host header", async () => {
    state.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = true;
    state.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    const outcome = await deliver(`http://hooks.customermates.test:${port}/pinned`);

    expect(outcome.status).toBe("success");
    expect(received).toEqual([{ url: "/pinned", host: `hooks.customermates.test:${port}`, userAgent: "node" }]);
  });

  it("does not follow a redirect, even to an allowed address", async () => {
    state.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = true;

    const outcome = await deliver(`http://127.0.0.1:${port}/redirect`);

    expect(outcome).toEqual({ status: "failed", statusCode: 302, responseMessage: "Redirect not followed" });
    expect(received.map((request) => request.url)).toEqual(["/redirect"]);
  });
});

describe("webhook delivery destinations in self-hosted mode", () => {
  it("delivers to a private destination by default", async () => {
    state.env.APP_MODE = "self-hosted";

    const outcome = await deliver(`http://127.0.0.1:${port}/hook`);

    expect(outcome.status).toBe("success");
    expect(received).toHaveLength(1);
  });

  it("refuses a private destination when WEBHOOK_BLOCK_PRIVATE_DESTINATIONS is set", async () => {
    state.env.APP_MODE = "self-hosted";
    state.env.WEBHOOK_BLOCK_PRIVATE_DESTINATIONS = true;

    const outcome = await deliver(`http://127.0.0.1:${port}/hook`);

    expect(outcome).toEqual({ status: "failed", statusCode: 422, responseMessage: "Destination not allowed" });
    expect(received).toHaveLength(0);
  });
});
