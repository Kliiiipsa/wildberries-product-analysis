import { NextRequest } from 'next/server';

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nmId = parseInt(body?.nmId ?? '');

  if (!nmId || isNaN(nmId)) {
    return Response.json({ error: 'Некорректный артикул' }, { status: 400 });
  }

  const token = (process.env.WB_API_TOKEN ?? '').trim();
  if (!token) {
    return Response.json({ error: 'WB_API_TOKEN не задан' }, { status: 500 });
  }

  const res = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      settings: {
        cursor: { limit: 10, offset: 0 },
        filter: { nmIds: [nmId], withPhoto: -1 },
      },
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    const text = await res?.text().catch(() => '');
    return Response.json({ error: `WB API ${res?.status ?? 'недоступен'}: ${text}` }, { status: 500 });
  }

  const data = await res.json();
  const card = data?.cards?.[0];

  if (!card) {
    return Response.json({ error: 'Артикул не найден в вашем кабинете' }, { status: 404 });
  }

  // Extract photo URLs — sort by sortOrder, use url (big) as primary
  const photos: string[] = [];

  if (Array.isArray(card.photos)) {
    const sorted = [...card.photos].sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0));
    for (const p of sorted) {
      const url = p?.url || p?.midUrl || p?.smallUrl || null;
      if (url) photos.push(url);
    }
  }

  // Fallback to mediaFiles if photos array is empty
  if (photos.length === 0 && Array.isArray(card.mediaFiles)) {
    for (const url of card.mediaFiles) {
      if (typeof url === 'string') photos.push(url);
    }
  }

  return Response.json({
    photos,
    title: card.title ?? '',
    brand: card.brand ?? '',
    nmId: card.nmID ?? nmId,
  });
}
