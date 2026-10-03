import net from "node:net";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { localEmailRequest } from "./local-email-provider.mjs";

const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function reject() {
  throw new Error("Local test transport blocked a non-loopback connection");
}
function validateUrl(input) {
  const url = new URL(input);
  if (["data:", "blob:"].includes(url.protocol)) return;
  if (!["http:", "https:", "postgres:", "postgresql:"].includes(url.protocol) || !loopback.has(url.hostname)) reject();
}
if (process.env.CRM_LOCAL_TEST_TRANSPORT !== "true")
  throw new Error("The browser test transport must be explicitly enabled");
for (const key of ["BASE_URL", "DATABASE_URL", "DIRECT_URL", "WORKFLOW_LOCAL_BASE_URL"]) {
  if (!process.env[key]) throw new Error("The browser test transport requires isolated local URLs");
  validateUrl(process.env[key]);
}
if (!/^\/crm_e2e(?:_[a-z0-9_]+)?$/.test(new URL(process.env.DATABASE_URL).pathname))
  throw new Error("The browser test transport requires an isolated browser test database");
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const localEmail = localEmailRequest(input, init);
  if (localEmail) return localEmail;
  validateUrl(typeof input === "string" || input instanceof URL ? input : input.url);
  return originalFetch.call(this, input, init);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (options && typeof options === "object") {
    if (!options.path && !loopback.has(options.host ?? options.hostname ?? "localhost")) reject();
  } else if (typeof options === "number") {
    if (typeof args[1] === "string" && !loopback.has(args[1])) reject();
  } else if (typeof options !== "string") reject();
  return connect.apply(this, args);
};
for (const transport of [http, https]) {
  const request = transport.request;
  transport.request = function (...args) {
    const options = args[0];
    if (typeof options === "string" || options instanceof URL) validateUrl(options);
    else if (!options?.socketPath && !loopback.has(options?.hostname ?? options?.host ?? "localhost")) reject();
    return request.apply(this, args);
  };
  transport.get = function (...args) {
    const result = transport.request(...args);
    result.end();
    return result;
  };
}
syncBuiltinESMExports();
