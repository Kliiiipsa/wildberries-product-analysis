import { NextRequest } from 'next/server';

export const maxDuration = 15;

const ALLOWED_HOSTS = ['wbbasket.ru', 'wildberries.ru', 'wb.ru'];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new Response('url required', { status: 400 });

  // Allow only WB CDN domains
  let parsed: URL;
  try { parsed = new URL(url); } catch { return new Response('invalid url', { status: 400 }); }
  if (!ALLOWED_HOSTS.some(h => parsed.hostname.endsWith(h))) {
    return new Response('forbidden', { status: 403 });
  }

  const res = await fetch(url, {
    headers: { 'Referer': 'https://www.wildberries.ru/' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    return new Response('upstream error', { status: 502 });
  }

  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') ?? 'image/webp';

  return new Response(buf, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
