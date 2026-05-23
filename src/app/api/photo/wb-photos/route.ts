import { NextRequest } from 'next/server';

export const maxDuration = 20;

function getWbBasket(vol: number): string {
  if (vol <= 143) return '01';
  if (vol <= 287) return '02';
  if (vol <= 431) return '03';
  if (vol <= 719) return '04';
  if (vol <= 1007) return '05';
  if (vol <= 1061) return '06';
  if (vol <= 1115) return '07';
  if (vol <= 1169) return '08';
  if (vol <= 1313) return '09';
  if (vol <= 1601) return '10';
  if (vol <= 1655) return '11';
  if (vol <= 1919) return '12';
  if (vol <= 2045) return '13';
  if (vol <= 2189) return '14';
  if (vol <= 2405) return '15';
  if (vol <= 2621) return '16';
  if (vol <= 2837) return '17';
  if (vol <= 3053) return '18';
  if (vol <= 3269) return '19';
  if (vol <= 3485) return '20';
  if (vol <= 3701) return '21';
  if (vol <= 3917) return '22';
  return String(23 + Math.floor((vol - 3918) / 216)).padStart(2, '0');
}

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

  const reqBody = {
    settings: {
      cursor: { limit: 10, offset: 0 },
      filter: { nmIds: [nmId], withPhoto: -1 },
    },
  };
  console.log(`[wb-photos] nmId=${nmId}, token_prefix=${token.slice(0, 20)}...`);
  console.log(`[wb-photos] request body: ${JSON.stringify(reqBody)}`);

  const res = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  }).catch((e) => { console.log(`[wb-photos] fetch error: ${e}`); return null; });

  if (!res || !res.ok) {
    const text = await res?.text().catch(() => '');
    console.log(`[wb-photos] WB API error: status=${res?.status}, body=${text}`);
    return Response.json({ error: `WB API ${res?.status ?? 'недоступен'}: ${text}` }, { status: 500 });
  }

  const data = await res.json();
  console.log(`[wb-photos] WB API ok, cards count=${data?.cards?.length ?? 0}`);
  console.log(`[wb-photos] raw response keys: ${Object.keys(data ?? {}).join(', ')}`);

  // nmIds filter in WB API doesn't reliably filter to a single article —
  // search the returned cards for the exact matching nmID
  const card = Array.isArray(data?.cards)
    ? data.cards.find((c: { nmID: number }) => c.nmID === nmId) ?? null
    : null;

  if (!card) {
    // Article not found in this account's catalog — use basket CDN fallback.
    // Try both webp (newer products) and jpg (older products); client hides failed images.
    console.log(`[wb-photos] nmId=${nmId} not in returned cards, using basket fallback`);
    const vol = Math.floor(nmId / 100000);
    const part = Math.floor(nmId / 1000);
    const basket = getWbBasket(vol);
    const fallbackPhotos: string[] = [];
    for (let i = 1; i <= 15; i++) {
      fallbackPhotos.push(`https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/${i}.webp`);
    }
    for (let i = 1; i <= 15; i++) {
      fallbackPhotos.push(`https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/${i}.jpg`);
    }
    console.log(`[wb-photos] basket fallback: vol=${vol}, part=${part}, basket=${basket}, ${fallbackPhotos.length} urls`);
    return Response.json({ photos: fallbackPhotos, title: '', brand: '', nmId, fallback: true });
  }

  console.log(`[wb-photos] found card nmID=${card.nmID}, title="${card.title}", photos_raw=${JSON.stringify(card.photos).slice(0, 300)}`);

  // Real photo structure from WB API: { big, hq, c516x688, c246x328 }
  // (NOT url/midUrl/smallUrl as documented — actual field names confirmed from logs)
  const photos: string[] = [];

  if (Array.isArray(card.photos)) {
    for (const p of card.photos) {
      const url = p?.big || p?.hq || p?.['c516x688'] || p?.['c246x328'] || p?.url || null;
      if (url) photos.push(url as string);
    }
    console.log(`[wb-photos] extracted from card.photos: ${photos.length} urls`);
  } else {
    console.log(`[wb-photos] card.photos is not array: ${typeof card.photos}`);
  }

  if (photos.length === 0 && Array.isArray(card.mediaFiles)) {
    for (const url of card.mediaFiles) {
      if (typeof url === 'string') photos.push(url);
    }
    console.log(`[wb-photos] mediaFiles fallback: ${photos.length} urls`);
  }

  // Last resort: basket formula (both webp + jpg)
  if (photos.length === 0) {
    const vol = Math.floor(nmId / 100000);
    const part = Math.floor(nmId / 1000);
    const basket = getWbBasket(vol);
    for (let i = 1; i <= 15; i++) {
      photos.push(`https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/${i}.webp`);
    }
    for (let i = 1; i <= 15; i++) {
      photos.push(`https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/${i}.jpg`);
    }
    console.log(`[wb-photos] last-resort basket formula: ${photos.length} urls`);
  }

  console.log(`[wb-photos] final photos count=${photos.length}, first=${photos[0] ?? 'none'}`);

  return Response.json({
    photos,
    title: card.title ?? '',
    brand: card.brand ?? '',
    nmId: card.nmID ?? nmId,
  });
}
