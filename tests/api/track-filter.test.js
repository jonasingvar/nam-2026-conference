import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './harness.js';

/** `trackSlug` takes one slug or several, comma-separated: any-of. */
let api;
let close;
let all;
let tracks;
let day;

before(async () => {
  const started = await startApi();
  api = started.api;
  close = started.close;
  const boot = await api.json('/bootstrap');
  tracks = boot.tracks.map((t) => t.slug);
  day = boot.days[0].date;
  all = await api.json('/sessions');
});
after(async () => { await close(); });

const idsOf = (rows) => rows.map((s) => s.id).sort((a, b) => a - b);
const inTracks = (slugs, rows = all) => rows.filter((s) => slugs.includes(s.track.slug));

describe('GET /sessions?trackSlug= with several tracks', () => {
  test('one slug is unchanged', async () => {
    const rows = await api.json(`/sessions?trackSlug=${tracks[0]}`);
    assert.ok(rows.length > 0);
    assert.deepEqual(idsOf(rows), idsOf(inTracks([tracks[0]])));
  });

  test('two slugs return exactly the union of both tracks', async () => {
    const [a, b] = tracks;
    const rows = await api.json(`/sessions?trackSlug=${a},${b}`);
    const expected = inTracks([a, b]);
    assert.ok(inTracks([a]).length > 0 && inTracks([b]).length > 0);
    assert.deepEqual(idsOf(rows), idsOf(expected));
    assert.ok(rows.length > inTracks([a]).length);
  });

  test('combines with the day filter', async () => {
    const [a, b] = tracks;
    const rows = await api.json(`/sessions?day=${day}&trackSlug=${a},${b}`);
    assert.deepEqual(idsOf(rows), idsOf(inTracks([a, b], all.filter((s) => s.day === day))));
  });

  test('an unknown slug among known ones is ignored; empty parts are dropped', async () => {
    const rows = await api.json(`/sessions?trackSlug=${tracks[0]},nope,`);
    assert.deepEqual(idsOf(rows), idsOf(inTracks([tracks[0]])));
  });
});
