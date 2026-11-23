import { INTRO } from './intro.jsx';
import { VERCEL } from './vercel.jsx';
import { SHIP, SHIP_PR } from './ship.jsx';
import { NEEDS_HUMAN, AFTER } from './after.jsx';

/**
 * The presentation, in order. Each chapter is `{ id, name, accent, beats, Scene }`:
 * one caption per beat (null for none), and a Scene drawn for a `step`.
 * needs-human breaks into ship where it happens — after the loop, before the
 * pull request — so the talk tells each idea once, at its station.
 *
 * The Vercel factory sits inside the opening, after the two ways in and before
 * the whole flow: once the room has seen the label start something, this is what
 * it starts. It cannot go after the map — that chapter's last beat unpacks ship's
 * stations and the next chapter must land on them (`enter: 'cut'`).
 */
export const CHAPTERS = [
  ...INTRO.slice(0, 3),   // the title, the ticket, the two ways in
  ...VERCEL,              // what the label on this repository actually starts
  ...INTRO.slice(3),      // the whole flow, then the zoom into ship
  ...SHIP, ...NEEDS_HUMAN, ...SHIP_PR, ...AFTER,
];
