/**
 * Shared pino logger. Uses `pino-pretty` transport in development for
 * readable output; emits plain JSON in production so Railway/Render
 * log pipelines can index structured fields.
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
});
