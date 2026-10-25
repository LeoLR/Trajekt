import { NextResponse } from 'next/server';
import type { ApiErrorCode } from './api-types';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  UNKNOWN_FORMAT: 422,
  UNSUPPORTED_MEDIA_TYPE: 415,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  NOT_CONFIGURED: 503,
  INTERNAL_ERROR: 500,
};

/** Forme d'erreur unique pour toutes les routes — voir docs/api-contract.md */
export function apiError(code: ApiErrorCode, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code], headers });
}

/** 429 avec Retry-After, que les exporters OTel respectent. */
export function rateLimited(retryAfterSeconds: number) {
  return apiError('RATE_LIMITED', `Too many requests for this project — retry in ${retryAfterSeconds}s (TRAJEKT_INGEST_RATE_PER_MIN).`, {
    'Retry-After': String(retryAfterSeconds),
  });
}
