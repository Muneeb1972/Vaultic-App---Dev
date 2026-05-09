/**
 * Zod-schema request validation middleware (Task 18.4, Req 29.3).
 *
 * Three factories — one per request surface — let routes declare their
 * schemas once and get a ready-to-mount `RequestHandler` that:
 *   • `parse`s the target surface against the schema
 *   • on success: REPLACES the surface with the parsed (and coerced)
 *     output so downstream handlers get the typed representation
 *   • on failure: emits a 400 with `{ error, code, details }` where
 *     `details` is the raw `ZodIssue[]` array (field-level feedback)
 *
 * Keeping all three factories here means the response shape stays
 * consistent across body/params/query failures.
 */
import type { RequestHandler } from 'express';
import type { ZodIssue, ZodSchema } from 'zod';

/** Which part of the request a validator targets. */
type RequestSurface = 'body' | 'params' | 'query';

/** Shape of a 400 validation error response. */
export interface ValidationErrorBody {
  error: 'Validation failed';
  code: 'VALIDATION_ERROR';
  details: ZodIssue[];
}

/** Build a middleware that validates `surface` against `schema`. */
function buildValidator<T>(
  surface: RequestSurface,
  schema: ZodSchema<T>,
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[surface]);
    if (!result.success) {
      const body: ValidationErrorBody = {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.issues,
      };
      res.status(400).json(body);
      return;
    }

    // Replace the surface with the parsed value so downstream handlers
    // see the coerced/transformed shape. `req.query` / `req.params` are
    // typed as `ParsedQs` / route params by Express; cast narrowly here
    // because Zod's output type is what handlers should actually read.
    (req as unknown as Record<RequestSurface, unknown>)[surface] = result.data;
    next();
  };
}

/** Validate `req.body` — the common case for POST / PUT handlers. */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return buildValidator('body', schema);
}

/** Validate `req.params` — useful for path parameters like `:treasuryId`. */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return buildValidator('params', schema);
}

/** Validate `req.query` — for pagination / filter query strings. */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return buildValidator('query', schema);
}
