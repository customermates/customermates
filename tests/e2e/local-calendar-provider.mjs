import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const localProviderKey = "e2e-local-provider-no-network";
const events = new Map();
const eventPath =
  /^\/v2\/(e2e_local_[a-f0-9-]{36})\/calendars\/(e2e_local_[a-f0-9-]{36})\/events(?:\/(e2e_event_[a-f0-9-]{36})(\/cancel)?)?$/;

function calendarDirectory(providerDirectory) {
  const directory = join(providerDirectory, "unipile", "calendar-events");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function writesFile(providerDirectory) {
  mkdirSync(join(providerDirectory, "unipile"), { recursive: true });
  return join(providerDirectory, "unipile", "calendar-writes.jsonl");
}

function eventFile(providerDirectory, key) {
  return join(calendarDirectory(providerDirectory), `${key.replaceAll(":", "__")}.json`);
}

export function seedLocalCalendarEvent(providerDirectory, accountId, calendarId, event) {
  if (!/^e2e_event_[a-f0-9-]{36}$/.test(event.id)) throw new Error("Local calendar events use e2e_event_<uuid> ids");
  writeFileSync(eventFile(providerDirectory, `${accountId}:${calendarId}:${event.id}`), JSON.stringify(event));
}

export function readLocalCalendarWrites(providerDirectory) {
  const file = writesFile(providerDirectory);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function providerDirectory() {
  return process.env.CRM_E2E_PROVIDER_DIRECTORY || null;
}

function load(key) {
  const directory = providerDirectory();
  if (!directory) return events.get(key);
  const file = eventFile(directory, key);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : events.get(key);
}

function save(key, event) {
  events.set(key, event);
  const directory = providerDirectory();
  if (directory) writeFileSync(eventFile(directory, key), JSON.stringify(event));
}

function recordWrite(entry) {
  const directory = providerDirectory();
  if (directory) appendFileSync(writesFile(directory), `${JSON.stringify(entry)}\n`);
}

function notFound() {
  return Response.json({ type: "errors/resource_not_found", status: 404 }, { status: 404 });
}

function stored(calendarId, id, body, previous = {}) {
  return {
    ...previous,
    object: "CalendarEvent",
    id,
    calendar_id: calendarId,
    title: body.title ?? previous.title ?? "",
    body: body.body ?? previous.body ?? null,
    location: body.location ?? previous.location ?? null,
    is_cancelled: false,
    is_all_day: body.start ? body.start.type === "date" : (previous.is_all_day ?? false),
    attendees: body.attendees ?? previous.attendees ?? [],
    start: body.start ?? previous.start,
    end: body.end ?? previous.end,
    conference: body.conference
      ? { provider: body.conference.provider, url: `https://meet.e2e.invalid/${id}` }
      : (previous.conference ?? null),
    transparency: body.transparency ?? previous.transparency ?? "opaque",
  };
}

function instant(time) {
  return time?.type === "date" ? Date.parse(`${time.date}T00:00:00.000Z`) : Date.parse(time?.date_time ?? "");
}

function shifted(time, byMs) {
  const moved = new Date(instant(time) + byMs).toISOString();
  return time.type === "date"
    ? { ...time, date: moved.slice(0, 10) }
    : { ...time, date_time: moved.replace(/\.\d{3}Z$/, "Z") };
}

function followSeries(accountId, calendarId, master, body, previous) {
  const directory = providerDirectory();
  if (!directory) return;
  const moved = body.start && body.end && previous.start ? instant(body.start) - instant(previous.start) : null;
  const length = body.start && body.end ? instant(body.end) - instant(body.start) : null;
  const prefix = `${accountId}__${calendarId}__`;
  for (const name of readdirSync(calendarDirectory(directory))) {
    if (!name.startsWith(prefix)) continue;
    const key = name.slice(0, -".json".length).replaceAll("__", ":");
    const occurrence = load(key);
    if (!occurrence || occurrence.master_event_id !== master) continue;
    const start = moved === null ? occurrence.start : shifted(occurrence.start, moved);
    const end = length === null ? occurrence.end : shifted(start, length);
    save(key, {
      ...occurrence,
      title: body.title ?? occurrence.title,
      body: body.body ?? occurrence.body,
      location: body.location ?? occurrence.location,
      start,
      end,
    });
  }
}

async function handle(request, accountId, calendarId, eventId, cancel) {
  const key = `${accountId}:${calendarId}:${eventId}`;
  if (!eventId && request.method === "POST") {
    const body = await request.json();
    if (typeof body.title !== "string" || !body.start || !body.end)
      throw new Error("Local calendar transport accepts timed events with a title only");
    const id = `e2e_event_${randomUUID()}`;
    const event = stored(calendarId, id, body);
    save(`${accountId}:${calendarId}:${id}`, event);
    return Response.json(event);
  }
  const current = load(key);
  if (!current) return notFound();
  if (cancel && request.method === "POST") {
    save(key, { ...current, is_cancelled: true });
    recordWrite({ accountId, calendarId, eventId, method: "CANCEL" });
    return Response.json({ id: eventId });
  }
  if (cancel) return null;
  if (request.method === "GET") return Response.json(current);
  if (request.method === "PATCH" || request.method === "PUT") {
    const body = await request.json();
    const event = stored(calendarId, eventId, body, current);
    save(key, event);
    recordWrite({ accountId, calendarId, eventId, method: request.method, body });
    if (current.recurrence?.length) followSeries(accountId, calendarId, eventId, body, current);
    return Response.json(event);
  }
  if (request.method === "DELETE") {
    events.delete(key);
    return Response.json({ id: eventId });
  }
  return null;
}

export function localCalendarRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.unipile.com" || process.env.UNIPILE_API_KEY !== localProviderKey) return null;
  const path = url.pathname.match(eventPath);
  if (!path || url.username || url.password) return null;
  const request = new Request(input, init);
  if (request.headers.get("X-API-KEY") !== localProviderKey) return null;

  return handle(request, path[1], path[2], path[3], Boolean(path[4]));
}
