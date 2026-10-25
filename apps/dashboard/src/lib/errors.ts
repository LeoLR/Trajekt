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
  NOT_CONFIGURED: 503,
  INTERNAL_ERROR: 500,
};

/** Forme d'erreur unique pour toutes les routes — voir docs/api-contract.md */
export function apiError(code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}
