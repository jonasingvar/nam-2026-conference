/**
 * How long a run took, three ways: from its start to now, the part of that
 * spent waiting for a person, and how long its agents ran. Pure — the workflow
 * hands in its own clock (`Date.now()` there is the run's logical clock, the
 * same on every replay), so nothing here reads the time.
 */

/** A length of time for a person: `45 s`, `7 min`, `2 h 05 min`. */
export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export type Times = {
  /** Start to now. */
  elapsed: number;
  /** Of that, the phases in which the run only waits for a person. */
  waiting: number;
  /** The rest: the run doing something. */
  working: number;
  /** Every agent's own running time, added up — agents that run side by side each count, so this can exceed `working`. */
  agents: number;
  /** Wall-clock time per working phase, in the order they were entered. */
  byPhase: Record<string, number>;
};

/** Time a run by its phases. `idle` names the phases that are a wait for a person. */
export function stopwatch(start: number, first: string, idle: string[] = []) {
  const spent: Record<string, number> = {};
  let phase = first;
  let since = start;
  let agents = 0;
  const close = (now: number) => { spent[phase] = (spent[phase] || 0) + Math.max(0, now - since); since = Math.max(since, now); };
  return {
    /** A phase begins: the one before it ends here. */
    enter(next: string, now: number) { close(now); phase = next; },
    /** An agent ran for this many seconds. */
    agent(seconds: number | undefined) { agents += Math.max(0, Number(seconds) || 0) * 1000; },
    /** The times as of `now`, the open phase included. */
    read(now: number): Times {
      const all = { ...spent, [phase]: (spent[phase] || 0) + Math.max(0, now - since) };
      const waiting = idle.reduce((sum, p) => sum + (all[p] || 0), 0);
      const elapsed = Math.max(0, now - start);
      const byPhase = Object.fromEntries(Object.entries(all).filter(([p, ms]) => !idle.includes(p) && ms >= 1000));
      return { elapsed, waiting, working: Math.max(0, elapsed - waiting), agents, byPhase };
    },
  };
}

/** One line for a comment: the work, then the wait and the whole only when there was a wait. */
export function timeLine(t: Times, o: { phases?: boolean } = {}): string {
  const phases = o.phases && Object.keys(t.byPhase).length ? ` — ${Object.entries(t.byPhase).map(([p, ms]) => `${p} ${span(ms)}`).join(', ')}` : '';
  return `${span(t.working)} working${phases}` +
    (t.agents ? ` · agents ran ${span(t.agents)} in total` : '') +
    (t.waiting >= 1000 ? ` · ${span(t.waiting)} waiting for you · ${span(t.elapsed)} start to finish` : '');
}
