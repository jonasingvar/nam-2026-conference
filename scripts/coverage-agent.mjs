/**
 * Preloaded into the API (`node --import ./scripts/coverage-agent.mjs
 * server/index.js`) only while `scripts/test-map.mjs build` runs the browser
 * suite one test at a time. It starts V8's precise coverage and answers
 * `GET /take` on ORBIT_COVERAGE_PORT with the repo files whose functions ran
 * since the last take — taking resets the counters, so each answer is one
 * test's. Never loaded by the app itself.
 */
import { Session } from 'node:inspector/promises';
import { createServer } from 'node:http';
import { executedFiles } from './test-map.mjs';

const port = Number(process.env.ORBIT_COVERAGE_PORT);
if (port) {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  const server = createServer(async (req, res) => {
    const { result } = await session.post('Profiler.takePreciseCoverage');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(executedFiles(result, process.cwd())));
  });
  server.listen(port, '127.0.0.1');
  server.unref();
}
