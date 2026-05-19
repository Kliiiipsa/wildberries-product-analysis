'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, BarChart2, FileText, Database, Star, Package, TrendingUp, Megaphone, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RawDataPanel } from '@/components/RawDataPanel';
import { ChatWidget } from '@/components/ChatWidget';
import type { AnalysisData } from '@/types';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import { assemblePrompt } from '@/lib/data-assembler';

interface AnalysisResultProps {
  article: string;
  analysis: string;
  isStreaming: boolean;
  rawData: AnalysisData | null;
  assembledPrompt: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={copy} className="gap-1.5 text-slate-400 hover:text-white">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Скопировано' : 'Копировать'}
    </Button>
  );
}

export function AnalysisResult({ article, analysis, isStreaming, rawData, assembledPrompt }: AnalysisResultProps) {
  const errorsCount = rawData ? Object.keys(rawData.errors).length : 0;

  return (
    <div className="w-full mt-8">

      {/* Product header card */}
      {rawData?.product ? (
        <div className="flex gap-4 p-4 rounded-2xl border border-slate-700/60 bg-slate-800/30 mb-5 backdrop-blur">
          <img
            src={rawData.product.photoUrl || getWBImageUrl(article)}
            alt={rawData.product.name}
            className="w-[80px] h-[80px] object-cover rounded-xl bg-slate-800 shrink-0"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              if (img.src !== getWBImageUrl(article)) {
                img.src = getWBImageUrl(article);
              } else {
                img.style.display = 'none';
              }
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2 mb-1">
              <span className="font-bold text-white text-base leading-snug">{rawData.product.name}</span>
              {rawData.product.salePercent > 0 && (
                <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  -{rawData.product.salePercent}%
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 mb-2.5">
              {rawData.product.brand}{rawData.product.subjectParentName ? ` · ${rawData.product.subjectParentName}` : ''} · арт. {article}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              {rawData.product.rating > 0 && (
                <span className="flex items-center gap-1 text-yellow-400 font-medium">
                  <Star className="h-3.5 w-3.5 fill-yellow-400" />
                  {rawData.product.rating}
                </span>
              )}
              <span className="font-bold text-emerald-400 text-base">{formatRub(rawData.product.priceSale)}</span>
              {rawData.product.priceBasic > rawData.product.priceSale && (
                <span className="text-slate-600 line-through text-xs">{formatRub(rawData.product.priceBasic)}</span>
              )}
              {rawData.product.totalStock > 0 && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  rawData.product.totalStock < 50
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : rawData.product.totalStock < 200
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  {rawData.product.totalStock} шт.
                </span>
              )}
            </div>
          </div>
          {/* Статус источников */}
          <div className="hidden sm:flex flex-col gap-1.5 shrink-0 items-end">
            {[
              { icon: Package, label: 'Карточка', ok: !!rawData.product },
              { icon: BarChart, label: 'Unit-экономика', ok: !!rawData.unitData?.found },
              { icon: TrendingUp, label: 'Статистика', ok: !!rawData.stats },
              { icon: Megaphone, label: 'Реклама', ok: !!rawData.advertising },
              { icon: Database, label: 'Mpstats', ok: !!rawData.mpstatsData },
            ].map(({ icon: Icon, label, ok }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <Icon className={`h-3 w-3 ${ok ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span className={ok ? 'text-slate-400' : 'text-slate-600'}>{label}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-xl font-bold text-white">
            Анализ артикула <span className="text-blue-400">{article}</span>
          </h2>
          <div className="flex gap-2">
            {errorsCount > 0 && <Badge variant="warning" className="text-xs">{errorsCount} ошибок</Badge>}
            {rawData?.collectedAt && <Badge variant="outline" className="text-xs text-slate-500">{rawData.collectedAt}</Badge>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="analysis">
        <TabsList className="w-full sm:w-auto mb-5 bg-slate-800/60 border border-slate-700/60 p-1 rounded-xl h-auto gap-1">
          <TabsTrigger value="analysis" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-none">
            <BarChart2 className="h-3.5 w-3.5" />
            AI Анализ
          </TabsTrigger>
          <TabsTrigger value="raw" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-none">
            <Database className="h-3.5 w-3.5" />
            Сырые данные
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-1.5 rounded-lg text-sm data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-none">
            <FileText className="h-3.5 w-3.5" />
            Промпт
          </TabsTrigger>
        </TabsList>

        {/* AI Analysis */}
        <TabsContent value="analysis">
          <div className="relative bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6 backdrop-blur">
            <div className="absolute top-4 right-4">
              <CopyButton text={analysis} />
            </div>
            <div className={`markdown prose prose-invert max-w-none ${isStreaming ? 'cursor' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {analysis
                  .replace(/^>\s*\*Анализирует:.*?\*\n\n/m, '')
                  .replace(/\\times/g, '×')
                  .replace(/\\div/g, '÷')
                  .replace(/\\geq/g, '≥')
                  .replace(/\\leq/g, '≤')
                  .replace(/\\cdot/g, '·')}
              </ReactMarkdown>
            </div>
            {isStreaming && analysis === '' && (
              <div className="flex items-center gap-2.5 text-slate-500">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-sm">Генерирую анализ...</span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Raw Data */}
        <TabsContent value="raw">
          {rawData ? (
            <RawDataPanel data={rawData} />
          ) : (
            <div className="text-center text-slate-500 py-12 text-sm">Данные ещё собираются...</div>
          )}
        </TabsContent>

        {/* Prompt */}
        <TabsContent value="prompt">
          <div className="relative bg-slate-900/60 border border-slate-700/60 rounded-2xl p-5 backdrop-blur">
            {assembledPrompt && (
              <div className="absolute top-4 right-4">
                <CopyButton text={assembledPrompt} />
              </div>
            )}
            <pre className="text-xs font-mono text-slate-500 whitespace-pre-wrap overflow-x-auto max-h-[600px] leading-relaxed">
              {assembledPrompt || 'Промпт будет доступен после завершения сбора данных.'}
            </pre>
          </div>
        </TabsContent>
      </Tabs>

      <ChatWidget
        analysis={analysis}
        article={article}
        isStreaming={isStreaming}
        assembledData={rawData ? assemblePrompt(rawData) : ''}
      />
    </div>
  );
}
