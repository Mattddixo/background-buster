import { buildServer } from './server.js';
import { config } from './config/index.js';
import { logger } from './logging/index.js';

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`background-buster listening on http://${config.HOST}:${config.PORT}`);
}

main().catch((err: unknown) => {
  logger.error(err);
  process.exit(1);
});
