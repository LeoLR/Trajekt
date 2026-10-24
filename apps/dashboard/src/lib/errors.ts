import { NextResponse } from 'next/server';
import type { ApiErrorCode } from './api-types.js';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  UNKNOWN_FORMAT: 422,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Forme d'erreur unique pour toutes les routes — voir api-contract.md */
export function apiError(code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}
