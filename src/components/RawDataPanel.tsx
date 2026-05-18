'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AnalysisData } from '@/types';
import { formatRub, formatPercent } from '@/lib/utils';

interface SectionProps {
  title: string;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline';
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, badge, badgeVariant = 'default', children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden bg-slate-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        }
        <span className="font-medium text-slate-200 text-sm">{title}</span>
        {badge && (
          <Badge variant={badgeVariant} className="ml-auto text-xs">
            {badge}
          </Badge>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-0.5 border-t border-slate-800/60">
          {children}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | undefined | null }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-1 border-b border-slate-800/40 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-right text-slate-200 font-mono text-xs">{value ?? '—'}</span>
    </div>
  );
}

interface RawDataPanelProps {
  data: AnalysisData;
}

export function RawDataPanel({ data }: RawDataPanelProps) {
  return (
    <div className="space-y-2">

      {/* WB Product */}
      <Section
        title="Карточка WB"
        badge={data.product ? 'Получено' : 'Нет данных'}
        badgeVariant={data.product ? 'success' : 'destructive'}
        defaultOpen={!!data.product}
      >
        {data.product ? (
          <>
            <Row label="Название"       value={data.product.name} />
            <Row label="Бренд"          value={data.product.brand} />
            <Row label="Категория"      value={`${data.product.subjectParentName} › ${data.product.subjectName}`} />
            <Row label="Цена до скидки" value={formatRub(data.product.priceBasic)} />
            <Row label="Цена со скидкой" value={`${formatRub(data.product.priceSale)} (−${data.product.salePercent}%)`} />
            {data.product.rating > 0 && (
              <Row label="Рейтинг"      value={`${data.product.rating} / 5`} />
            )}
            <Row label="Фото"           value={`${data.product.pics} шт.`} />
            <Row label="Остаток"        value={`${data.product.totalStock} шт.`} />
            {data.product.stocks.length > 0 && (
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-800/60">
                <div className="px-3 py-1.5 bg-slate-800/40 text-xs text-slate-500 font-medium">
                  Остатки по складам
                </div>
                {data.product.stocks
                  .filter((s) => s.qty > 0)
                  .sort((a, b) => b.qty - a.qty)
                  .map((s, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5 border-t border-slate-800/40 text-xs">
                      <span className="text-slate-400">{s.warehouseName ?? `Склад ${s.warehouseId}`}</span>
                      <span className="text-slate-200 font-mono">{s.qty} шт.</span>
                    </div>
                  ))}
              </div>
            )}
            <Row label="Цвета" value={data.product.colors.join(', ') || '—'} />
            {data.product.description && (
              <div className="mt-2 p-3 bg-slate-800/30 rounded-lg text-xs border border-slate-800/60">
                <div className="text-slate-500 mb-1 font-medium">Описание</div>
                <div className="text-slate-400 leading-relaxed">
                  {data.product.description.slice(0, 400)}
                  {data.product.description.length > 400 ? '…' : ''}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-red-400 py-1">{data.errors['wb_product'] || 'Не получено'}</div>
        )}
      </Section>

      {/* Unit */}
      <Section
        title="Unit-экономика (Google Sheets)"
        badge={data.unitData?.found ? 'Найдено' : 'Не найдено'}
        badgeVariant={data.unitData?.found ? 'success' : 'warning'}
      >
        {data.unitData?.found ? (
          <pre className="mt-1 text-xs font-mono whitespace-pre-wrap text-slate-300 bg-slate-800/40 border border-slate-800/60 p-3 rounded-lg overflow-x-auto leading-relaxed">
            {data.unitData.rawText}
          </pre>
        ) : (
          <div className="text-xs text-slate-500 py-1">
            {data.unitData?.rawText || data.errors['google_unit'] || 'Нет данных'}
          </div>
        )}
      </Section>

      {/* Stats */}
      <Section
        title="Статистика WB (7 дней)"
        badge={data.stats ? 'Получено' : 'Нет'}
        badgeVariant={data.stats ? 'success' : 'warning'}
      >
        {data.stats ? (
          <>
            <Row label="Период"                value={data.stats.period} />
            <Row label="Показы"                value={data.stats.views.toLocaleString('ru')} />
            <Row label="Перешли в карточку"    value={data.stats.openCardCount.toLocaleString('ru')} />
            <Row label="CTR (показы→карточка)" value={data.stats.views > 0 ? formatPercent((data.stats.openCardCount / data.stats.views) * 100) : '—'} />
            <Row label="В корзину"             value={data.stats.addToCartCount.toLocaleString('ru')} />
            <Row label="В отложенные"          value={data.stats.addToWishlist.toLocaleString('ru')} />
            <Row label="Заказов"               value={`${data.stats.ordersCount} (${formatRub(data.stats.ordersSumRub)})`} />
            <Row label="Выкупов"               value={`${data.stats.buyoutsCount} (${formatRub(data.stats.buyoutsSumRub)})`} />
            <Row label="% выкупа"              value={formatPercent(data.stats.buyoutPercent)} />
            <Row label="Отмен"                 value={data.stats.cancelCount} />
            <Row label="Ср. цена заказа"       value={formatRub(data.stats.avgPriceRub)} />
            <Row label="Заказов / день"        value={data.stats.avgOrdersCountPerDay} />
            <Row label="Карточка→Корзина"      value={formatPercent(data.stats.conversions.addToCartPercent)} />
            <Row label="Корзина→Заказ"         value={formatPercent(data.stats.conversions.cartToOrderPercent)} />
            <Row label="Заказ→Выкуп"           value={formatPercent(data.stats.conversions.buyoutsPercent)} />
          </>
        ) : (
          <div className="text-xs text-slate-500 py-1">{data.errors['wb_stats'] || 'Нет данных'}</div>
        )}
      </Section>

      {/* Advertising */}
      <Section
        title="Реклама WB"
        badge={data.advertising ? 'Получено' : 'Нет'}
        badgeVariant={data.advertising ? 'success' : 'warning'}
      >
        {data.advertising ? (
          <>
            <Row label="Расход"           value={formatRub(data.advertising.totalSpend)} />
            <Row label="Заказов с рекламы" value={data.advertising.totalOrders} />
            <Row label="CTR"              value={formatPercent(data.advertising.avgCtr)} />
            <Row label="CPC"              value={formatRub(data.advertising.avgCpc)} />
            <Row label="ДРР"              value={formatPercent(data.advertising.drr)} />
            {data.advertising.campaigns.length > 0 && (
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-800/60">
                <div className="px-3 py-1.5 bg-slate-800/40 text-xs text-slate-500 font-medium">
                  Кампании
                </div>
                {data.advertising.campaigns.slice(0, 5).map((c, i) => {
                  const typeLabels: Record<number, string> = { 4: 'Каталог', 5: 'Карточка', 6: 'Поиск', 7: 'Поиск+Карточка', 8: 'Поиск+Каталог', 9: 'Авто' };
                  const typeName = typeLabels[c.type] ?? `Тип ${c.type}`;
                  const isAuto = c.type === 9;
                  return (
                    <div key={i} className="px-3 py-2 border-t border-slate-800/40 text-xs">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-300 truncate">{c.name || `#${c.advertId}`}</span>
                        <span className="text-yellow-400 shrink-0">{formatRub(c.sum)}</span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isAuto ? 'bg-violet-900/60 text-violet-300' : 'bg-blue-900/60 text-blue-300'}`}>
                          {typeName}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isAuto ? 'bg-violet-900/40 text-violet-400' : 'bg-slate-700/60 text-slate-400'}`}>
                          {isAuto ? 'Единая ставка' : 'Ручная'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-slate-500 py-1">{data.errors['wb_advertising'] || 'Нет данных'}</div>
        )}
      </Section>

      {/* Mpstats */}
      <Section
        title="Mpstats"
        badge={data.mpstatsData ? 'Получено' : 'Нет'}
        badgeVariant={data.mpstatsData ? 'success' : 'warning'}
      >
        {data.mpstatsData ? (
          <>
            {data.mpstatsData.productInfo && (
              <>
                <Row label="Продаж за 30 дней" value={data.mpstatsData.productInfo.sales30} />
                <Row label="Выручка 30 дней"   value={formatRub(data.mpstatsData.productInfo.revenue30)} />
                <Row label="Средняя цена"       value={formatRub(data.mpstatsData.productInfo.avgPrice)} />
              </>
            )}
            {data.mpstatsData.competitors.length > 0 && (
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-800/60">
                <div className="px-3 py-1.5 bg-slate-800/40 text-xs text-slate-500 font-medium">
                  Конкуренты ({data.mpstatsData.competitors.length})
                </div>
                {data.mpstatsData.competitors.slice(0, 5).map((c, i) => (
                  <div key={i} className="px-3 py-2 border-t border-slate-800/40 text-xs">
                    <div className="text-slate-300 truncate">{i + 1}. {c.name.slice(0, 45)}</div>
                    <div className="flex gap-3 mt-0.5 text-slate-500">
                      <span className="text-yellow-400">{formatRub(c.price)}</span>
                      <span>{c.sales30} прод/30д</span>
                      <span className="text-slate-600">{c.brand}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.mpstatsData.positions.length > 0 && (
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-800/60">
                <div className="px-3 py-1.5 bg-slate-800/40 text-xs text-slate-500 font-medium">
                  Позиции ({data.mpstatsData.positions.length})
                </div>
                {data.mpstatsData.positions.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 border-t border-slate-800/40 text-xs">
                    <span className="text-slate-300 truncate">«{p.keyword}»</span>
                    <span className="text-blue-400 shrink-0 ml-2">поз. {p.position}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-slate-500 py-1">{data.errors['mpstats'] || 'Нет данных'}</div>
        )}
      </Section>

      {/* Seasonality */}
      <Section
        title="Сезонность (Mpstats)"
        badge={data.seasonalityData ? 'Получено' : 'Нет'}
        badgeVariant={data.seasonalityData ? 'success' : 'warning'}
      >
        {data.seasonalityData ? (() => {
          const { keyword, productName, category, seasonality } = data.seasonalityData;
          const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
          const currentMonth = new Date().getMonth() + 1;
          const chartData = Array.from({ length: 12 }, (_, i) => ({
            label: MONTHS[i], num: i + 1, coeff: seasonality[String(i + 1)] ?? null,
          }));
          const maxCoeff = Math.max(...chartData.map((d) => d.coeff ?? 0), 1.0);
          const currentCoeff = seasonality[String(currentMonth)] ?? null;

          function barColor(c: number) {
            if (c >= 1.2)  return 'bg-emerald-500';
            if (c >= 1.05) return 'bg-blue-500';
            if (c >= 0.9)  return 'bg-slate-500';
            if (c >= 0.75) return 'bg-amber-500';
            return 'bg-red-500';
          }
          function textColor(c: number) {
            if (c >= 1.2)  return 'text-emerald-400';
            if (c >= 1.05) return 'text-blue-400';
            if (c >= 0.9)  return 'text-slate-400';
            if (c >= 0.75) return 'text-amber-400';
            return 'text-red-400';
          }

          return (
            <div className="space-y-3 pt-1">
              {/* Info */}
              <div className="text-xs text-slate-500">
                {productName && <span className="text-slate-300 font-medium">{productName}</span>}
                {category && <span> · {category}</span>}
                <div className="mt-0.5">Ключевое слово: «{keyword}»</div>
              </div>

              {/* Current month */}
              {currentCoeff !== null && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-800/20 px-3 py-2">
                  <div>
                    <div className="text-[10px] text-slate-500">Сейчас — {MONTHS[currentMonth - 1]}</div>
                    <div className={`text-2xl font-bold tabular-nums ${textColor(currentCoeff)}`}>×{currentCoeff}</div>
                  </div>
                  <div className={`ml-auto text-xs font-medium ${textColor(currentCoeff)}`}>
                    {currentCoeff >= 1.2 ? 'Высокий сезон' :
                     currentCoeff >= 1.05 ? 'Выше нормы' :
                     currentCoeff >= 0.9 ? 'Норма' :
                     currentCoeff >= 0.75 ? 'Ниже нормы' : 'Низкий сезон'}
                  </div>
                </div>
              )}

              {/* Bar chart */}
              <div className="flex items-end gap-0.5" style={{ height: '80px' }}>
                {chartData.map(({ label, num, coeff }) => {
                  const isCurrent = num === currentMonth;
                  if (coeff === null) {
                    return (
                      <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="flex-1" />
                        <div className="w-full bg-slate-800/60 rounded-sm" style={{ height: '2px' }} />
                        <div className="text-[9px] text-slate-700">{label}</div>
                      </div>
                    );
                  }
                  const barH = Math.max(3, Math.round((coeff / maxCoeff) * 52));
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className={`text-[8px] font-semibold tabular-nums ${textColor(coeff)}`}>{coeff}</div>
                      <div className="w-full flex items-end" style={{ height: '52px' }}>
                        <div
                          className={`w-full rounded-sm ${barColor(coeff)} ${isCurrent ? 'ring-1 ring-white/30' : 'opacity-75'}`}
                          style={{ height: `${barH}px` }}
                        />
                      </div>
                      <div className={`text-[9px] ${isCurrent ? 'text-white font-semibold' : 'text-slate-600'}`}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : (
          <div className="text-xs text-slate-500 py-1">{data.errors['seasonality'] || 'Нет данных'}</div>
        )}
      </Section>

      {/* Errors */}
      {Object.keys(data.errors).length > 0 && (
        <Section
          title="Ошибки при сборе"
          badge={String(Object.keys(data.errors).length)}
          badgeVariant="destructive"
        >
          {Object.entries(data.errors).map(([k, v]) => (
            <div key={k} className="py-1.5 border-b border-slate-800/40 last:border-0">
              <span className="text-red-400 font-mono text-xs">[{k}]</span>
              <span className="text-slate-500 text-xs ml-2">{v}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
