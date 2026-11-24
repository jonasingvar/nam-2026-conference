import { OPENING } from './opening.jsx';
import { PLATFORM } from './platform.jsx';
import { SHIP } from './ship.jsx';
import { CLOSING } from './closing.jsx';

/**
 * The engineering talk — the software factory — in order. Each chapter is
 * `{ id, name, accent, tone, beats, Scene, enter? }`: one caption per beat
 * (null for none), and a Scene drawn for a `step`.
 *
 * The promise and the ticket; the factory floor (the map, the seven
 * workflows); then the spine: one ship run followed along its rail from
 * Triage to Production, each Vercel piece taught at the station where it
 * happens; then what it costs, running many at once, and your role.
 */
export const CHAPTERS = [...OPENING, ...PLATFORM, ...SHIP, ...CLOSING];
