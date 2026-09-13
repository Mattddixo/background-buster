import type { FastifyInstance } from 'fastify';
import presetsRoutes from './routes/presets.js';
import photoRoutes from './routes/photo.js';
import gifRoutes from './routes/gif.js';
import generateRoutes from './routes/generate.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(presetsRoutes);
  await app.register(photoRoutes);
  await app.register(gifRoutes);
  await app.register(generateRoutes);
}
