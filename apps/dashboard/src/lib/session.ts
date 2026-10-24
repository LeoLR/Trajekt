/**
 * Session du dashboard : jeton "expiration.signature" signé en HMAC-SHA256
 * avec DASHBOARD_SESSION_SECRET. Écrit avec WebCrypto pour fonctionner à
 * la fois dans le middleware (runtime Edge) et dans les routes Node.
 */

export const SESSION_COOKIE = 'trajekt_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

function getSecret(): string {
  const s = process.env.DASHBOARD_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('DASHBOARD_SESSION_SECRET manquant ou trop court (16 caractères min.) — voir .env.example');
  }
  return s;
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now = Date.now(), secret = getSecret()): Promise<string> {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${expires}.${await hmac(String(expires), secret)}`;
}

export async function isValidSessionToken(
  token: string | undefined,
  now = Date.now(),
  secret = getSecret(),
): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return constantTimeEqual(sig, await hmac(exp, secret));
}
