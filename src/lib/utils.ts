import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU').format(n);
}

export function formatRub(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

export function formatPercent(n: number | undefined | null, decimals = 1): string {
  if (n == null || isNaN(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

export function getLast7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function getLast30Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function parseRussianDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const dmyMatch = dateStr.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  }

  const isoMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return new Date(dateStr);

  return null;
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const d = parseRussianDate(dateStr);
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

export function getWBImageUrl(article: string, photoIndex = 1): string {
  const id = parseInt(article, 10);
  const vol = Math.floor(id / 100000);
  const part = Math.floor(id / 1000);

  let basket: string;
  if (vol <= 143) basket = '01';
  else if (vol <= 287) basket = '02';
  else if (vol <= 431) basket = '03';
  else if (vol <= 719) basket = '04';
  else if (vol <= 1007) basket = '05';
  else if (vol <= 1061) basket = '06';
  else if (vol <= 1115) basket = '07';
  else if (vol <= 1169) basket = '08';
  else if (vol <= 1313) basket = '09';
  else if (vol <= 1601) basket = '10';
  else if (vol <= 1655) basket = '11';
  else if (vol <= 1919) basket = '12';
  else if (vol <= 2045) basket = '13';
  else if (vol <= 2189) basket = '14';
  else if (vol <= 2405) basket = '15';
  else if (vol <= 2621) basket = '16';
  else if (vol <= 2837) basket = '17';
  else if (vol <= 3053) basket = '18';
  else if (vol <= 3269) basket = '19';
  else if (vol <= 3485) basket = '20';
  else if (vol <= 3701) basket = '21';
  else if (vol <= 3917) basket = '22';
  else if (vol <= 4133) basket = '23';
  else if (vol <= 4349) basket = '24';
  else if (vol <= 4565) basket = '25';
  else if (vol <= 4781) basket = '26';
  else if (vol <= 4997) basket = '27';
  else if (vol <= 5213) basket = '28';
  else if (vol <= 5429) basket = '29';
  else if (vol <= 5645) basket = '30';
  else if (vol <= 5861) basket = '31';
  else if (vol <= 6077) basket = '32';
  else if (vol <= 6293) basket = '33';
  else if (vol <= 6509) basket = '34';
  else if (vol <= 6725) basket = '35';
  else if (vol <= 6941) basket = '36';
  else if (vol <= 7157) basket = '37';
  else if (vol <= 7373) basket = '38';
  else if (vol <= 7589) basket = '39';
  else if (vol <= 7805) basket = '40';
  else basket = '40';

  return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${article}/images/big/${photoIndex}.webp`;
}
