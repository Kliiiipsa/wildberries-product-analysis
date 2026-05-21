import { NextRequest, NextResponse } from 'next/server';
import { fetchWBProduct, fetchWBStats } from '@/lib/wildberries';
import { fetchUnitData } from '@/lib/google-sheets';
import { fetchMpstatsData } from '@/lib/mpstats';
import type { WhatIfBaseData, WhatIfUnitCost } from '@/types';

export const maxDuration = 30;

function parseNum(rawText: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rawText.match(new RegExp(escaped + '[^:\\n]*:\\s*([\\d,.]+)', 'i'));
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, '.')) || 0;
}

export async function GET(req: NextRequest) {
  const nmIdStr = req.nextUrl.searchParams.get('nmId') || '';

  if (!nmIdStr || !/^\d{6,12}$/.test(nmIdStr)) {
    return NextResponse.json({ error: 'Укажите корректный артикул (nmId)' }, { status: 400 });
  }

  const wbToken = process.env.WB_API_TOKEN || '';
  const mpToken = process.env.MPSTATS_API_KEY || '';

  const [productResult, statsResult, unitResult, mpResult] = await Promise.allSettled([
    fetchWBProduct(nmIdStr, wbToken || undefined),
    wbToken ? fetchWBStats(nmIdStr, wbToken) : Promise.resolve(null),
    fetchUnitData(nmIdStr),
    mpToken ? fetchMpstatsData(nmIdStr, mpToken) : Promise.resolve(null),
  ]);

  const product = productResult.status === 'fulfilled' ? productResult.value : null;
  if (!product) {
    const err = productResult.status === 'rejected' ? String(productResult.reason) : 'Товар не найден';
    return NextResponse.json({ error: err }, { status: 404 });
  }

  const stats = statsResult.status === 'fulfilled' ? statsResult.value?.stats ?? null : null;
  const unit  = unitResult.status  === 'fulfilled' ? unitResult.value  : null;
  const mp    = mpResult.status    === 'fulfilled' ? mpResult.value    : null;

  // Daily sales: prefer MPStats 30d average over WB 7d average
  const mp30 = mp?.productInfo?.sales30 ?? 0;
  const wb7  = stats?.ordersCount ?? 0;
  const dailySales = Math.max(0.1, mp30 > 0 ? mp30 / 30 : wb7 / 7);

  const buyoutRate = stats?.buyoutPercent ?? 50;

  // Parse unit costs
  const raw = unit?.found ? unit.rawText : '';
  const zakupka        = parseNum(raw, 'Закупка');
  const kargo          = parseNum(raw, 'Карго');
  const logistika      = parseNum(raw, 'Логистика МП с % выкупа');
  const hranenie       = parseNum(raw, 'Хранение в день');
  const komissiyaRub   = parseNum(raw, 'Комиссия WB');
  const ekvairingPercent = parseNum(raw, 'Эквайринг');

  let ndsRub = 0;
  let ndsPercent = 0;
  const ndsRubM  = raw.match(/НДС \(итого, руб\.\):\s*([\d,.]+)/i);
  const ndsPercM = raw.match(/НДС \(ставка %\):\s*([\d,.]+)/i);
  if (ndsRubM)  ndsRub     = parseFloat(ndsRubM[1].replace(',', '.'))  || 0;
  else if (ndsPercM) ndsPercent = parseFloat(ndsPercM[1].replace(',', '.')) || 0;

  const unitCost: WhatIfUnitCost = {
    zakupka, kargo, logistika, hranenie,
    komissiyaRub, ekvairingPercent, ndsRub, ndsPercent,
    hasData: unit?.found ?? false,
  };

  const result: WhatIfBaseData = {
    nmId: parseInt(nmIdStr, 10),
    productName: product.name,
    brand: product.brand,
    photoUrl: product.photoUrl,
    priceSale: product.priceSale,
    priceBasic: product.priceBasic,
    salePercent: product.salePercent,
    stock: product.totalStock,
    dailySales,
    buyoutRate,
    unitCost,
  };

  return NextResponse.json(result);
}
