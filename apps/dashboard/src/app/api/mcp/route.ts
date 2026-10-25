/**
 * POST /api/mcp — serveur MCP (Streamable HTTP, sans état, lecture seule).
 *
 * Authentification : Authorization: Bearer tk_read_… (clé de lecture),
 * ou session du dashboard. Ouvert en mode démo.
 *
 * Exemple (Claude Code) :
 *   claude mcp add --transport http trajekt https://<instance>/api/mcp \
 *     --header "Authorization: Bearer tk_read_..."
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../server/db';
import { referenceNow } from '../../../server/clock';
import { handleMcp } from '../../../server/mcp';
import { authorizeRead } from '../../../lib/route';

export const runtime = 'nodejs';

const rpcError = (code: number, message: string, status: number) =>
  NextResponse.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status });

export async function POST(req: NextRequest) {
  const db = getDb();
  const project = await authorizeRead(req, db);
  if (project instanceof Response) {
    return rpcError(-32001, 'Unauthorized: send Authorization: Bearer <read API key> (tk_read_…).', 401);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(-32700, 'Parse error', 400);
  }
  try {
    const out = await handleMcp(body, async () => ({ db, projectId: project.id, now: await referenceNow(db, project.id) }));
    if (out === null) return new NextResponse(null, { status: 202 });
    return NextResponse.json(out);
  } catch (e) {
    console.error(e);
    return rpcError(-32603, 'Internal error', 500);
  }
}

/** Pas de flux serveur → client : ce serveur ne pousse rien. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: 'POST' } });
}

/** Sans état : il n'y a pas de session à fermer. */
export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { allow: 'POST' } });
}
