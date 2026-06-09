// Article access control — Edge runtime compatible (fetch only, no Node.js built-ins).
// Admin can access any article. Manager can only access articles in their WB tag.

import type { SessionUser } from './auth';

// Best-effort in-process cache (may be empty on edge cold starts, that's acceptable).
const cache = new Map<string, { nmIds: Set<number>; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchTagNmIds(tagName: string): Promise<Set<number>> {
  const hit = cache.get(tagName);
  if (hit && Date.now() < hit.exp) return hit.nmIds;

  const token = (process.env.WB_API_TOKEN ?? '').trim();
  if (!token) return new Set<number>();

  try {
    const tagsRes = await fetch('https://content-api.wildberries.ru/content/v2/tags', {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(8000),
    });
    if (!tagsRes.ok) return new Set<number>();

    const tags: { id: number; name: string }[] = (await tagsRes.json())?.data ?? [];
    const tag = tags.find(t => t.name === tagName);
    if (!tag) return new Set<number>();

    const nmIds = new Set<number>();
    for (let offset = 0; offset < 5000; offset += 100) {
      if (offset > 0) await new Promise(r => setTimeout(r, 150)); // rate-limit courtesy
      const r = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            cursor: { limit: 100, offset },
            filter: { tagIDs: [tag.id], withPhoto: -1 },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) break;
      const cards: { nmID: number }[] = (await r.json())?.cards ?? [];
      for (const c of cards) nmIds.add(Number(c.nmID));
      if (cards.length < 100) break;
    }

    cache.set(tagName, { nmIds, exp: Date.now() + CACHE_TTL_MS });
    return nmIds;
  } catch {
    return new Set<number>();
  }
}

export async function canAccessArticle(user: SessionUser, article: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (!user.tagName) return false;
  const nmId = parseInt(article, 10);
  if (isNaN(nmId)) return false;
  const allowed = await fetchTagNmIds(user.tagName);
  return allowed.has(nmId);
}

// Throws with a user-friendly message on access denied.
export async function assertCanAccessArticle(user: SessionUser, article: string): Promise<void> {
  if (user.role === 'admin') return;
  const ok = await canAccessArticle(user, article);
  if (!ok) throw new Error('Артикул не входит в ваш WB-тег. Обратитесь к администратору.');
}
