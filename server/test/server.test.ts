import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

// Integration-level, not unit: this exists specifically because a
// validation error was observed to bypass the intended 400 response and
// fall through to a raw 500 (a zod-version quirk broke `instanceof
// ZodError` across module boundaries — see server.ts). A pure pipeline
// test can't catch that class of bug; only actually hitting the route can.
describe('error handling', () => {
  it('turns a schema validation failure into a 400, not a 500', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/collage/layout?count=99&width=100&height=100' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('returns a well-formed PipelineError response', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/api/generate/not-a-real-style', payload: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('UNKNOWN_STYLE');
    await app.close();
  });
});
