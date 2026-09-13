import pino, { type LoggerOptions } from 'pino';
import { config } from '../config/index.js';

// Deliberately no body/file serializers here: image bytes and upload
// filenames must never reach a log line, per the no-storage guarantee.
// Fastify's own default request/response serializers already stick to
// method/url/statusCode, never the body, so there's nothing extra to add.
export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
};

export const logger = pino(loggerOptions);
