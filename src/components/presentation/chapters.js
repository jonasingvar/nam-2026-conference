import { OPENING } from './opening.jsx';
import { PLATFORM } from './platform.jsx';
import { SHIP, NEEDS_HUMAN, SHIP_ON } from './ship.jsx';
import { CLOSING } from './closing.jsx';

/**
 * The engineering talk — the software factory — in order. Each chapter is
 * `{ id, name, accent, tone, beats, Scene, enter? }`: one caption per beat
 * (null for none), and a Scene drawn for a `step`.
 *
 * The promise and the ticket first; then the platform, one Vercel piece per
 * chapter; then one ship run from Triage to Production, with needs-human
 * breaking in where it happens (after the loop, before the pull request); then
 * what it costs, your role, and a ticket of your own.
 */
export const CHAPTERS = [...OPENING, ...PLATFORM, ...SHIP, ...NEEDS_HUMAN, ...SHIP_ON, ...CLOSING];
