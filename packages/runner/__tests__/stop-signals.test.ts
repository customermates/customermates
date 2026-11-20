import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { STOP_SIGNAL_NAMES, installStopSignals } from "../src/stop-signals.js";

describe("stop signals", () => {
  it("handles SIGINT, SIGTERM and SIGHUP", () => {
    expect([...STOP_SIGNAL_NAMES]).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);
  });

  it("asks for a stop on the first signal, forces it on the second and exits on the third", () => {
    const source = new EventEmitter();
    const exit = vi.fn();
    const signals = installStopSignals(source, exit);

    expect(signals.stop.aborted).toBe(false);
    source.emit("SIGINT");
    expect(signals.stop.aborted).toBe(true);
    expect(signals.force.aborted).toBe(false);

    source.emit("SIGINT");
    expect(signals.force.aborted).toBe(true);
    expect(exit).not.toHaveBeenCalled();

    source.emit("SIGINT");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it.each(STOP_SIGNAL_NAMES)("counts %s like every other stop signal", (name) => {
    const source = new EventEmitter();
    const signals = installStopSignals(source, vi.fn());

    source.emit("SIGTERM");
    source.emit(name);

    expect(signals.stop.aborted).toBe(true);
    expect(signals.force.aborted).toBe(true);
  });

  it("keeps its handlers installed after a signal, so a second one never falls back to the default that kills the runner", () => {
    const source = new EventEmitter();
    installStopSignals(source, vi.fn());

    for (const name of STOP_SIGNAL_NAMES) source.emit(name);

    for (const name of STOP_SIGNAL_NAMES) expect(source.listenerCount(name)).toBe(1);
  });

  it("is what the command line installs, with the forced stop handed to the job", () => {
    const cli = readFileSync(join(__dirname, "..", "src", "cli.ts"), "utf8");

    expect(cli).toContain("installStopSignals(process");
    expect(cli).toContain("forceSignal: signals.force");
    expect(cli).not.toContain("process.once(");
  });
});
