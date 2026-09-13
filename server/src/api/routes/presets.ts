import type { FastifyInstance } from 'fastify';
import { presets } from '../../presets/index.js';

export default async function presetsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/presets', async () => presets);
}
