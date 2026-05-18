import { NextRequest } from 'next/server';
import { fetchWBProduct, fetchWBStats, fetchWBAdvertising, fetchWBProductFallback } from '@/lib/wildberries';
import { fetchUnitData } from '@/lib/google-sheets';
import { fetchMpstatsData, fetchSeasonalityData } from '@/lib/mpstats';
import { assemblePrompt } from '@/lib/data-assembler';
import { analyzeWithGroqStream } from '@/lib/groq-client';
import type { AnalysisData, StreamEvent } from '@/types';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { article } = await req.json();

  if (!article || !/^\d{6,12}$/.test(article.trim())) {
    return new Response(
      JSON.stringify({ error: 'Введите корректный артикул WB (6–12 цифр)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const articleStr = article.trim();
  const wbToken = process.env.WB_API_TOKEN || '';
  const mpToken = process.env.MPSTATS_API_KEY || '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const errors: Record<string, string> = {};

      try {
        // Step 1: WB product card
        send({ type: 'status', message: '📦 Загружаю карточку товара WB...' });
        let product = null;
        try {
          product = await fetchWBProduct(articleStr, wbToken || undefined);
        } catch (e) {
          errors['wb_product'] = String(e);
          send({ type: 'status', message: `⚠️ Карточка WB: ${e}` });
        }

        // Step 2: Unit-экономика (Google Sheets)
        send({ type: 'status', message: '📊 Читаю Unit-экономику...' });
        let unitData = null;
        try {
          unitData = await fetchUnitData(articleStr);
        } catch (e) {
          errors['google_unit'] = String(e);
        }

        // Step 4: WB stats + advertising — parallel
        let stats = null;
        let statsMeta: { name: string; brand: string; rating: number; subjectName: string } | null = null;
        let advertising = null;
        if (wbToken) {
          send({ type: 'status', message: '📈 Загружаю статистику и рекламу WB...' });
          const [statsResult, advResult] = await Promise.allSettled([
            fetchWBStats(articleStr, wbToken),
            fetchWBAdvertising(articleStr, wbToken),
          ]);

          if (statsResult.status === 'fulfilled' && statsResult.value) {
            stats = statsResult.value.stats;
            statsMeta = statsResult.value.meta ?? null;
          } else if (statsResult.status === 'rejected') {
            errors['wb_stats'] = String(statsResult.reason);
            console.warn('[Route] wb_stats failed:', statsResult.reason);
          }

          if (advResult.status === 'fulfilled') advertising = advResult.value;
          else {
            errors['wb_advertising'] = String(advResult.reason);
            console.warn('[Route] wb_advertising failed:', advResult.reason);
          }
        } else {
          errors['wb_stats'] = 'WB_API_TOKEN не задан';
          errors['wb_advertising'] = 'WB_API_TOKEN не задан';
        }

        // Fallback: карточка без имени — берём из рекламы или SalesFunnel meta
        const fallbackName = advertising?.productName || statsMeta?.name || '';
        if ((!product || !product.name) && fallbackName && wbToken) {
          try {
            const fallback = await fetchWBProductFallback(articleStr, fallbackName, wbToken);
            const base = product?.totalStock
              ? { ...fallback, totalStock: product.totalStock, stocks: product.stocks }
              : fallback;
            product = {
              ...base,
              brand:       base.brand       || statsMeta?.brand       || '',
              rating:      base.rating      || statsMeta?.rating       || 0,
              subjectName: base.subjectName || statsMeta?.subjectName  || '',
            };
            send({ type: 'status', message: '📦 Карточка восстановлена' });
          } catch (e) {
            errors['wb_product_fallback'] = String(e);
          }
        }

        // Step 5: Mpstats + сезонность (параллельно)
        let mpstatsData = null;
        let seasonalityData = null;
        if (mpToken) {
          send({ type: 'status', message: '🔍 Загружаю данные Mpstats...' });
          const [mpResult, seasonResult] = await Promise.allSettled([
            fetchMpstatsData(articleStr, mpToken),
            fetchSeasonalityData(articleStr, mpToken),
          ]);

          if (mpResult.status === 'fulfilled') mpstatsData = mpResult.value;
          else errors['mpstats'] = String(mpResult.reason);

          if (seasonResult.status === 'fulfilled') seasonalityData = seasonResult.value;
          else errors['seasonality'] = String(seasonResult.reason);
        } else {
          errors['mpstats'] = 'MPSTATS_API_KEY не задан';
          errors['seasonality'] = 'MPSTATS_API_KEY не задан';
        }

        const analysisData: AnalysisData = {
          article: articleStr,
          product,
          stats,
          advertising,
          unitData,
          mpstatsData,
          seasonalityData,
          errors,
          collectedAt: new Date().toLocaleString('ru-RU'),
        };

        send({ type: 'data', payload: analysisData });

        // Step 6: Groq AI analysis
        send({ type: 'status', message: '🤖 Анализирую с помощью Groq AI...' });
        const prompt = assemblePrompt(analysisData);
        send({ type: 'prompt', prompt });

        try {
          for await (const token of analyzeWithGroqStream(prompt)) {
            send({ type: 'token', content: token });
          }
        } catch (e) {
          send({ type: 'error', error: `Groq: ${e}` });
        }

        send({ type: 'done' });
      } catch (e) {
        send({ type: 'error', error: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
