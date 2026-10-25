import { cookies, headers } from 'next/headers';
import { getDb } from '../server/db';
import { resolveProject } from '../server/auth';
import { referenceNow } from '../server/clock';
import { PROJECT_COOKIE } from '../lib/session';
import { LANG_COOKIE, pickLang, setLang, type Lang } from '../lib/i18n';

/** Langue de l'interface pour cette requête (cookie, sinon Accept-Language). */
export async function requestLang(): Promise<Lang> {
  const lang = pickLang((await cookies()).get(LANG_COOKIE)?.value, (await headers()).get('accept-language'));
  setLang(lang);
  return lang;
}

/** Base, projet courant (choisi dans l'interface) et instant de référence pour les pages serveur. */
export async function pageContext() {
  await requestLang();
  const db = getDb();
  const selected = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = await resolveProject(db, selected);
  return { db, project, now: project ? await referenceNow(db, project.id) : new Date() };
}
