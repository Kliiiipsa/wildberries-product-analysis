import { NextRequest } from 'next/server';

export const maxDuration = 30;

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
  const n = 23 + Math.floor((vol - 3918) / 216);
  return String(n).padStart(2, '0');
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nmId = parseInt(body?.nmId ?? '');

  if (!nmId || isNaN(nmId)) {
    return Response.json({ error: 'Некорректный артикул' }, { status: 400 });
  }

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const basket = getWbBasket(vol);
  const base = `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/`;

  // Probe photos 1-20 in parallel with HEAD requests
  const checks = Array.from({ length: 20 }, (_, i) => {
    const url = `${base}${i + 1}.jpg`;
    return fetch(url, { method: 'HEAD' })
      .then(r => (r.ok ? url : null))
      .catch(() => null);
  });

  const results = await Promise.all(checks);
  const photos = results.filter(Boolean) as string[];

  return Response.json({ photos, basket, vol, part });
}
