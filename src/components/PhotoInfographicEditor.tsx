'use client';

import { useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface Characteristic {
  title: string;
  value: string;
}

interface InfographicData {
  productName: string;
  productSubtitle: string;
  tagline: string;
  characteristics: Characteristic[];
  bottomText: string;
}

type TemplateStyle = 'light' | 'dark' | 'beige' | 'black';

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  generatePrompt?: string;
  onExport?: (dataUrl: string) => void;
}

const CARD_W = 900;
const CARD_H = 1200;

const DEFAULT_DATA: InfographicData = {
  productName: 'НАЗВАНИЕ',
  productSubtitle: 'на каждый день',
  tagline: 'новинка сезона',
  characteristics: [
    { title: 'КАЧЕСТВО', value: 'натуральные материалы' },
    { title: 'КОМФОРТ', value: 'удобная посадка' },
    { title: 'СТИЛЬ', value: 'актуальный дизайн' },
  ],
  bottomText: 'стиль и качество в каждой детали',
};

// Per-template palette
const T = {
  light: {
    scrimRgb: '248,244,238', scrimA: 0.72,
    textColor: '#1C1C1C', subColor: 'rgba(28,28,28,0.56)',
    accent: '#9C7A3C', stroke: '#C49A3C',
    tagBg: 'rgba(156,122,60,0.12)', tagText: '#9C7A3C',
    badgeBg: 'rgba(156,122,60,0.14)',
    shadowColor: 'rgba(255,255,255,0.7)',
  },
  dark: {
    scrimRgb: '14,13,18', scrimA: 0.68,
    textColor: '#F2EFE9', subColor: 'rgba(242,239,233,0.52)',
    accent: '#C9A96E', stroke: '#C9A96E',
    tagBg: 'rgba(201,169,110,0.15)', tagText: '#C9A96E',
    badgeBg: 'rgba(201,169,110,0.12)',
    shadowColor: 'rgba(0,0,0,0.5)',
  },
  beige: {
    scrimRgb: '238,228,212', scrimA: 0.74,
    textColor: '#2C1F0E', subColor: 'rgba(44,31,14,0.52)',
    accent: '#8B5E30', stroke: '#A0723E',
    tagBg: 'rgba(139,94,48,0.12)', tagText: '#8B5E30',
    badgeBg: 'rgba(139,94,48,0.14)',
    shadowColor: 'rgba(255,255,255,0.65)',
  },
  black: {
    scrimRgb: '0,0,0', scrimA: 0.72,
    textColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.52)',
    accent: '#E0C97A', stroke: '#E0C97A',
    tagBg: 'rgba(224,201,122,0.15)', tagText: '#E0C97A',
    badgeBg: 'rgba(224,201,122,0.12)',
    shadowColor: 'rgba(0,0,0,0.6)',
  },
} as const;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 99): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      if (lines.length >= maxLines) return lines;
      cur = w;
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  style: TemplateStyle,
) {
  const W = CARD_W, H = CARD_H;
  const t = T[style];
  const PAD = 56;           // left margin (after accent stripe)
  const TEXT_W = 400;       // max text block width

  // ── 1. Photo: full-bleed, object-cover ────────────────────────────────────
  const sx = W / img.naturalWidth, sy = H / img.naturalHeight;
  const sc = Math.max(sx, sy);
  const dW = img.naturalWidth * sc, dH = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);

  // ── 2. Scrim: left gradient for text readability ───────────────────────────
  // Wide soft fade — photo shows through on the right, text readable on left
  const scrim = ctx.createLinearGradient(0, 0, W * 0.62, 0);
  scrim.addColorStop(0,    `rgba(${t.scrimRgb},${t.scrimA})`);
  scrim.addColorStop(0.55, `rgba(${t.scrimRgb},${t.scrimA * 0.55})`);
  scrim.addColorStop(1,    `rgba(${t.scrimRgb},0)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W * 0.62, H);

  // Bottom fade (for bottom text readability)
  const bScrim = ctx.createLinearGradient(0, H - 180, 0, H);
  bScrim.addColorStop(0, `rgba(${t.scrimRgb},0)`);
  bScrim.addColorStop(1, `rgba(${t.scrimRgb},${t.scrimA * 0.75})`);
  ctx.fillStyle = bScrim;
  ctx.fillRect(0, H - 180, W, 180);

  // ── 3. Accent stripe ───────────────────────────────────────────────────────
  ctx.fillStyle = t.accent;
  ctx.fillRect(0, 0, 8, H);

  // ── 4. Text elements ───────────────────────────────────────────────────────
  ctx.textAlign = 'left';

  let y = 62;

  // 4a. Tagline — small caps, muted, above the big name
  ctx.font = `600 13px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.subColor;
  ctx.textBaseline = 'top';
  ctx.fillText(data.tagline.toUpperCase(), PAD, y);
  y += 13 + 20;

  // 4b. Product name — dominant hero element
  const NS = 94; // name font size
  ctx.font = `900 ${NS}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor;
  ctx.shadowColor = t.shadowColor;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const nameLines = wrapText(ctx, data.productName.toUpperCase(), TEXT_W, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += Math.ceil(NS * 1.03);
  }
  ctx.shadowBlur = 0;
  y += 20;

  // 4c. Subtitle badge — НА КАЖДЫЙ ДЕНЬ style
  const SS = 14;
  ctx.font = `600 ${SS}px Arial, Helvetica, sans-serif`;
  const sStr = data.productSubtitle.toUpperCase();
  const sTW = ctx.measureText(sStr).width;
  const sPX = 18, sPY = 10;
  const sBW = sTW + sPX * 2, sBH = SS + sPY * 2;
  pill(ctx, PAD, y, sBW, sBH, 4);
  ctx.fillStyle = t.tagBg; ctx.fill();
  pill(ctx, PAD, y, sBW, sBH, 4);
  ctx.strokeStyle = t.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.tagText;
  ctx.textBaseline = 'middle';
  ctx.fillText(sStr, PAD + sPX, y + sBH / 2);
  ctx.textBaseline = 'top';
  y += sBH + 50;

  // 4d. Characteristics — 3 rows
  const chars = data.characteristics.slice(0, 3);
  const BADGE = 44, CTIT = 18, CVAL = 15, CROW = 92;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Badge square
    pill(ctx, PAD, y, BADGE, BADGE, 10);
    ctx.fillStyle = t.badgeBg; ctx.fill();
    pill(ctx, PAD, y, BADGE, BADGE, 10);
    ctx.strokeStyle = t.stroke; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `bold ${Math.round(BADGE * 0.5)}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), PAD + BADGE / 2, y + BADGE / 2 + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Title + value
    const TX = PAD + BADGE + 16;
    const TW = TEXT_W - BADGE - 16;
    const hasVal = !!ch.value;
    const rowContentH = CTIT + (hasVal ? CVAL + 4 : 0);
    const titleY = y + (BADGE - rowContentH) / 2;

    ctx.font = `700 ${CTIT}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.shadowColor = t.shadowColor; ctx.shadowBlur = 4;
    ctx.fillText(ch.title.toUpperCase(), TX, titleY);
    ctx.shadowBlur = 0;

    if (hasVal) {
      ctx.font = `${CVAL}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subColor;
      const vls = wrapText(ctx, ch.value, TW, 2);
      let vy = titleY + CTIT + 4;
      for (const vl of vls) { ctx.fillText(vl, TX, vy); vy += CVAL + 2; }
    }
    y += CROW;
  }

  // 4e. Bottom text — italic serif, anchored near bottom
  if (data.bottomText) {
    const btY = H - 82;
    // thin rule
    ctx.beginPath();
    ctx.moveTo(PAD, btY - 18); ctx.lineTo(PAD + TEXT_W - 20, btY - 18);
    ctx.strokeStyle = t.stroke; ctx.lineWidth = 1; ctx.globalAlpha = 0.28; ctx.stroke();
    ctx.globalAlpha = 1;

    const btSz = 18;
    ctx.font = `italic ${btSz}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subColor; ctx.textBaseline = 'top';
    const btLines = wrapText(ctx, data.bottomText, TEXT_W, 2);
    let bty = btY;
    for (const bl of btLines) { ctx.fillText(bl, PAD, bty); bty += btSz + 5; }
  }

  // ── 5. Bottom accent bar ───────────────────────────────────────────────────
  ctx.fillStyle = t.accent;
  ctx.fillRect(0, H - 8, W, 8);
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(`/api/photo/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Не удалось загрузить изображение (${res.status})`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function PhotoInfographicEditor({ imageUrl, analysis, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [template, setTemplate] = useState<TemplateStyle>('light');
  const [loadingText, setLoadingText] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState('');

  const generateAIText = async () => {
    setLoadingText(true);
    try {
      const res = await fetch('/api/photo/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const json = await res.json();
      if (json.productName) {
        setData({
          productName: json.productName ?? DEFAULT_DATA.productName,
          productSubtitle: json.productSubtitle ?? DEFAULT_DATA.productSubtitle,
          tagline: json.tagline ?? DEFAULT_DATA.tagline,
          characteristics: (json.characteristics ?? DEFAULT_DATA.characteristics).slice(0, 3),
          bottomText: json.bottomText ?? DEFAULT_DATA.bottomText,
        });
      }
    } catch { /* ignore */ } finally {
      setLoadingText(false);
    }
  };

  const renderCard = useCallback(async (): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('no canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    const imgSrc = await toDataUrl(imageUrl);
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        drawCard(ctx, img, data, template);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = imgSrc;
    });
  }, [imageUrl, data, template]);

  const handleRender = async () => {
    if (!imageUrl) return;
    setRendering(true);
    setResultUrl(null);
    setRenderError('');
    try {
      const url = await renderCard();
      setResultUrl(url);
      onExport?.(url);
    } catch (e) {
      setRenderError(String(e));
    } finally {
      setRendering(false);
    }
  };

  const updateChar = (i: number, field: 'title' | 'value', val: string) =>
    setData(prev => {
      const chars = [...prev.characteristics];
      chars[i] = { ...chars[i], [field]: val };
      return { ...prev, characteristics: chars };
    });

  const TMPL: [TemplateStyle, string, string][] = [
    ['light', 'Светлый', 'bg-amber-50 text-amber-900 border border-amber-200'],
    ['dark', 'Тёмный', 'bg-zinc-900 text-zinc-100 border border-zinc-700'],
    ['beige', 'Бежевый', 'bg-amber-100 text-amber-950 border border-amber-300'],
    ['black', 'Чёрный', 'bg-black text-yellow-300 border border-yellow-700'],
  ];

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-4">

        {/* Result */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden max-h-[520px] min-h-[260px] relative flex items-center justify-center">
            {rendering ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">Создаю карточку...</p>
              </div>
            ) : resultUrl ? (
              <>
                <img src={resultUrl} alt="Карточка" className="w-full h-full object-contain" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button onClick={() => { const a = document.createElement('a'); a.href = resultUrl!; a.download = 'wb-card.jpg'; a.click(); }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
                    ⬇ Скачать
                  </button>
                  <button onClick={() => setResultUrl(null)}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">
                    ↩ Изменить
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center p-8 text-zinc-600">
                <div className="text-5xl mb-3">🖼</div>
                <p className="text-sm font-medium text-zinc-500">Заполните поля и нажмите «Создать»</p>
              </div>
            )}
          </div>

          {renderError && (
            <div className="mt-2 rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">
              {renderError}
            </div>
          )}

          <button onClick={handleRender} disabled={!imageUrl || rendering}
            className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {rendering ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</> : '✨ Создать карточку товара'}
          </button>

          <div className="mt-2 flex gap-1 flex-wrap">
            {TMPL.map(([t, label, cls]) => (
              <button key={t} onClick={() => { setTemplate(t); setResultUrl(null); }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${cls} ${template === t ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-90'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="w-60 shrink-0 flex flex-col gap-3">
          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Текст</span>
              <button onClick={generateAIText} disabled={loadingText}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1">
                {loadingText ? <Loader2 className="h-3 w-3 animate-spin" /> : '✨'} AI
              </button>
            </div>
            <input value={data.tagline} onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
              placeholder="тег (новинка / хит продаж)"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
            <input value={data.productName} onChange={e => setData(p => ({ ...p, productName: e.target.value }))}
              placeholder="НАЗВАНИЕ ТОВАРА"
              className="w-full bg-zinc-700 text-white text-sm font-bold px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500" />
            <input value={data.productSubtitle} onChange={e => setData(p => ({ ...p, productSubtitle: e.target.value }))}
              placeholder="на каждый день"
              className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
          </div>

          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Характеристики</span>
            {data.characteristics.map((ch, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-zinc-700/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 w-4 shrink-0">{i + 1}.</span>
                  <input value={ch.title} onChange={e => updateChar(i, 'title', e.target.value)}
                    placeholder="ЗАГОЛОВОК"
                    className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <input value={ch.value} onChange={e => updateChar(i, 'value', e.target.value)}
                  placeholder="уточнение"
                  className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-5" />
              </div>
            ))}
          </div>

          <div className="bg-zinc-800 rounded-xl p-3">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1.5 block">Подпись внизу</span>
            <input value={data.bottomText} onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
              placeholder="стиль и качество"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
