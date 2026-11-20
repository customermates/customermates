export const STOP_SIGNAL_NAMES = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export type StopSignalName = (typeof STOP_SIGNAL_NAMES)[number];

export type StopSignalSource = { on(name: StopSignalName, listener: () => void): unknown };

export type StopSignals = { stop: AbortSignal; force: AbortSignal };

export function installStopSignals(source: StopSignalSource, exit: (code: number) => void): StopSignals {
  const stop = new AbortController();
  const force = new AbortController();
  const onSignal = () => {
    if (!stop.signal.aborted) stop.abort();
    else if (!force.signal.aborted) force.abort();
    else exit(1);
  };
  for (const name of STOP_SIGNAL_NAMES) source.on(name, onSignal);
  return { stop: stop.signal, force: force.signal };
}
