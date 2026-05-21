import type { AnalysisData } from '@/types';
import { formatRub, formatPercent } from '@/lib/utils';

export function assemblePrompt(data: AnalysisData): string {
  const blocks: string[] = [];

  // === АРТИКУЛ ===
  blocks.push(`=== АРТИКУЛ ===\n${data.article}`);

  // === КАРТОЧКА ТОВАРА (WB) ===
  if (data.product) {
    const p = data.product;
    const lines = [
      `Название: ${p.name}`,
      `Бренд: ${p.brand}`,
      `Категория: ${p.subjectParentName} > ${p.subjectName}`,
      `Цена до скидки: ${formatRub(p.priceBasic)}`,
      `Цена со скидкой: ${formatRub(p.priceSale)} (-${p.salePercent}%)`,
      ...(p.rating > 0 ? [`Рейтинг: ${p.rating}/5`] : []),
      ...(p.colors.length > 0 ? [`Цвета: ${p.colors.join(', ')}`] : []),
      `Остаток общий: ${p.totalStock} шт.`,
    ];

    if (p.description) {
      lines.push(`\nОписание:\n${p.description.slice(0, 800)}${p.description.length > 800 ? '...' : ''}`);
    }

    blocks.push(`=== КАРТОЧКА ТОВАРА (WB) ===\n${lines.join('\n')}`);

    // Остатки по складам — топ-5 по количеству
    if (p.stocks.length > 0) {
      const stockLines = p.stocks
        .filter((s) => s.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map((s) => `  ${s.warehouseName ?? `Склад ${s.warehouseId}`}: ${s.qty} шт.`);
      blocks.push(`=== ОСТАТКИ ПО СКЛАДАМ ===\nОбщий остаток: ${p.totalStock} шт.\n${stockLines.join('\n')}`);
    }
  } else {
    blocks.push(`=== КАРТОЧКА ТОВАРА (WB) ===\nДанные не получены`);
  }

// === UNIT (Google Таблица) ===
  if (data.unitData?.found) {
    blocks.push(`=== UNIT-ЭКОНОМИКА (Google Таблица) ===\n${data.unitData.rawText}`);
  } else {
    const reason = data.unitData?.rawText || 'Данные не получены';
    blocks.push(`=== UNIT-ЭКОНОМИКА (Google Таблица) ===\n${reason}`);
  }

  // === РЕКЛАМА И СТАТИСТИКА WB ===
  const statsLines: string[] = [];

  if (data.stats) {
    const s = data.stats;
    const ctr = s.views > 0 ? (s.openCardCount / s.views) * 100 : 0;
    statsLines.push(
      `Период: ${s.period}`,
      `Показы (impressions): ${s.views}`,
      `Перешли в карточку: ${s.openCardCount}`,
      `CTR (показы→карточка): ${s.views > 0 ? formatPercent(ctr) : '—'}`,
      `Добавили в корзину: ${s.addToCartCount}`,
      `Добавили в отложенные: ${s.addToWishlist}`,
      `Заказов: ${s.ordersCount} (${formatRub(s.ordersSumRub)})`,
      `Выкупов: ${s.buyoutsCount} (${formatRub(s.buyoutsSumRub)})`,
      `% выкупа: ${formatPercent(s.buyoutPercent)}`,
      `Отмен: ${s.cancelCount} (${formatRub(s.cancelSumRub)})`,
      `Средняя цена заказа: ${formatRub(s.avgPriceRub)}`,
      `Заказов в день (среднее): ${s.avgOrdersCountPerDay}`,
      '',
      'Конверсии:',
      `  Показы → Карточка (CTR): ${s.views > 0 ? formatPercent(ctr) : '—'}`,
      `  Карточка → Корзина: ${formatPercent(s.conversions.addToCartPercent)}`,
      `  Корзина → Заказ: ${formatPercent(s.conversions.cartToOrderPercent)}`,
      `  Заказ → Выкуп: ${formatPercent(s.conversions.buyoutsPercent)}`,
    );
  } else {
    statsLines.push('Статистика WB не получена (нужен WB_API_TOKEN)');
  }

  if (data.advertising) {
    const a = data.advertising;

    // Выручка с рекламы — берётся из основной (одной) активной кампании
    const adRevenue = a.campaigns.reduce((s, c) => s + c.sum_price, 0);
    // ROMI = (Выручка − Расход) / Расход × 100%
    const romi = a.totalSpend > 0 ? ((adRevenue - a.totalSpend) / a.totalSpend) * 100 : 0;
    // Реклама на единицу выкупа (для расчёта маржи с рекламой в unit-экономике)
    const adPerBuyout = data.stats && data.stats.buyoutsCount > 0
      ? a.totalSpend / data.stats.buyoutsCount
      : null;

    const campTypeLabel = (type: number) => {
      const types: Record<number, string> = { 0: 'АРК авто', 4: 'каталог (ПРК)', 5: 'карточка', 6: 'поиск (CPC)', 7: 'поиск+карточка', 8: 'поиск+каталог', 9: 'АРК авто' };
      return types[type] || `тип ${type}`;
    };

    statsLines.push(
      '',
      'РЕКЛАМА:',
      `Общий расход: ${formatRub(a.totalSpend)}`,
      `Заказов с рекламы: ${a.totalOrders}`,
      `CTR рекламы: ${formatPercent(a.avgCtr)}`,
      `CPC средний: ${formatRub(a.avgCpc)}`,
      `ДРР: ${formatPercent(a.drr)}`,
      ...(adPerBuyout !== null ? [`Реклама на ед. выкупа: ${formatRub(adPerBuyout)}`] : []),
    );

    if (a.campaigns.length > 0) {
      statsLines.push('', 'Топ кампаний (по расходу):');
      a.campaigns
        .sort((x, y) => y.sum - x.sum)
        .slice(0, 5)
        .forEach((c) => {
          const campDrr = c.sum_price > 0 ? (c.sum / c.sum_price) * 100 : 0;
          statsLines.push(
            `  [${c.advertId}] ${c.name || 'Без названия'} (${campTypeLabel(c.type)}):` +
            ` расход ${formatRub(c.sum)}, выручка ${formatRub(c.sum_price)},` +
            ` CTR ${formatPercent(c.ctr)}, CPC ${formatRub(c.cpc)},` +
            ` заказов ${c.orders}, ДРР ${c.sum_price > 0 ? formatPercent(campDrr) : '—'}`
          );
        });
    }

    if (a.note) statsLines.push(`\nПримечание: ${a.note}`);
  } else {
    statsLines.push('\nРеклама WB не получена (нужен WB_API_TOKEN)');
  }

  blocks.push(`=== РЕКЛАМА И СТАТИСТИКА WB ===\n${statsLines.join('\n')}`);

  // === MPSTATS ===
  if (data.mpstatsData) {
    const mp = data.mpstatsData;
    const mpLines: string[] = [];

    if (mp.productInfo) {
      mpLines.push(
        'ДАННЫЕ АРТИКУЛА (Mpstats):',
        `Продаж за 30 дней: ${mp.productInfo.sales30}`,
        `Выручка за 30 дней: ${formatRub(mp.productInfo.revenue30)}`,
        `Средняя цена: ${formatRub(mp.productInfo.avgPrice)}`,
        `Позиция в категории: ${mp.productInfo.position || '—'}`,
        '',
      );
    }

    if (mp.competitors.length > 0) {
      mpLines.push('КОНКУРЕНТЫ (топ-3 по продажам):');
      mp.competitors.slice(0, 3).forEach((c, i) => {
        const perColor = c.colors_count && c.colors_count > 1
          ? ` (~${Math.round(c.sales30 / c.colors_count)} шт./цвет, ${c.colors_count} цв.)`
          : '';
        mpLines.push(
          `${i + 1}. Арт. ${c.article} | ${c.brand} — ${c.name.slice(0, 50)}`,
          `   Цена: ${formatRub(c.price)} | Рейтинг: ${c.rating} | Продаж/30д: ${c.sales30}${perColor} | Остаток: ${c.balance} шт.`,
        );
      });
      mpLines.push('');
    }

    if (mp.positions.length > 0) {
      mpLines.push('ПОЗИЦИИ В ПОИСКЕ:');
      mp.positions.forEach((p) => {
        mpLines.push(`  "${p.keyword}" → поз. ${p.position} (стр. ${p.page}) | частота: ${p.frequency}`);
      });
      mpLines.push('');
    }

    if (mp.semantics.length > 0) {
      mpLines.push('СЕМАНТИКА (ключевые запросы):');
      mp.semantics.forEach((s) => {
        mpLines.push(`  "${s.keyword}" | частота: ${s.frequency}${s.ctr !== undefined ? ` | CTR: ${formatPercent(s.ctr)}` : ''}`);
      });
    }

    blocks.push(`=== MPSTATS (конкуренты, позиции, тренды) ===\n${mpLines.join('\n')}`);
  } else {
    blocks.push(`=== MPSTATS (конкуренты, позиции, тренды) ===\nДанные не получены (нужен MPSTATS_API_KEY)`);
  }

  // === СЕЗОННОСТЬ ===
  if (data.seasonalityData) {
    const { keyword, seasonality } = data.seasonalityData;
    const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    const currentMonth = new Date().getMonth() + 1;
    const coeffs = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const c = seasonality[String(m)];
      const mark = m === currentMonth ? '←' : '';
      return c !== undefined ? `${MONTHS_SHORT[i]}×${c}${mark}` : `${MONTHS_SHORT[i]}—`;
    }).join(' ');
    blocks.push(`=== СЕЗОННОСТЬ (Mpstats) ===\nКлюч: «${keyword}»\n${coeffs}`);
  } else {
    blocks.push(`=== СЕЗОННОСТЬ (Mpstats) ===\nДанные не получены`);
  }

  // === ДОПОЛНИТЕЛЬНО ===
  const additionalLines: string[] = [`Дата анализа: ${data.collectedAt}`];
  if (Object.keys(data.errors).length > 0) {
    additionalLines.push('', 'Ошибки при сборе данных:');
    Object.entries(data.errors).forEach(([k, v]) => additionalLines.push(`  ${k}: ${v}`));
  }
  blocks.push(`=== ДОПОЛНИТЕЛЬНО ===\n${additionalLines.join('\n')}`);

  return blocks.join('\n\n');
}
