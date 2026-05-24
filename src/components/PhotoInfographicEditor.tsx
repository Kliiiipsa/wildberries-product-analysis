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
  productSubtitle: 'лёгкий и дышащий',
  tagline: 'новинка сезона',
  characteristics: [
    { title: 'Качество', value: 'натуральные материалы' },
    { title: 'Комфорт', value: 'удобная посадка' },
    { title: 'Стиль', value: 'актуальный дизайн' },
  ],
  bottomText: 'стиль и качество в каждой детали',
};

// Per-template palette
const T = {
  light: {
    scrimRgb: '252,250,246', scrimA: 0.90,
    textColor: '#18150E', subColor: 'rgba(24,21,14,0.46)',
    accent: '#8C6D3F', stroke: '#B08A52',
    pillBg: 'rgba(255,255,255,0.78)',
    pillIconBg: 'rgba(140,109,63,0.10)',
    shadowColor: 'rgba(255,255,255,0.55)',
  },
  dark: {
    scrimRgb: '10,9,16', scrimA: 0.82,
    textColor: '#F0EDE4', subColor: 'rgba(240,237,228,0.50)',
    accent: '#C9A96E', stroke: '#C9A96E',
    pillBg: 'rgba(20,18,32,0.76)',
    pillIconBg: 'rgba(201,169,110,0.12)',
    shadowColor: 'rgba(0,0,0,0.60)',
  },
  beige: {
    scrimRgb: '250,243,230', scrimA: 0.88,
    textColor: '#2A1C0C', subColor: 'rgba(42,28,12,0.48)',
    accent: '#9B6B3A', stroke: '#B07E44',
    pillBg: 'rgba(255,248,236,0.80)',
    pillIconBg: 'rgba(155,107,58,0.12)',
    shadowColor: 'rgba(255,236,196,0.50)',
  },
  black: {
    scrimRgb: '5,4,10', scrimA: 0.86,
    textColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.50)',
    accent: '#D4B86A', stroke: '#D4B86A',
    pillBg: 'rgba(10,9,20,0.80)',
    pillIconBg: 'rgba(212,184,106,0.12)',
    shadowColor: 'rgba(0,0,0,0.70)',
  },
} as const;

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Draw text with extra letter-spacing (canvas has no letterSpacing in old engines) */
function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Canvas icons ──────────────────────────────────────────────────────────────

function iconLeaf(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(cx + r * 0.88, cy - r * 0.45, cx + r * 0.88, cy + r * 0.38, cx, cy + r * 0.22);
  ctx.bezierCurveTo(cx - r * 0.88, cy + r * 0.38, cx - r * 0.88, cy - r * 0.45, cx, cy - r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.72);
  ctx.lineTo(cx, cy + r * 0.18);
  ctx.stroke();
  ctx.restore();
}

function iconSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const pts = 4;
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.36;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function iconButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  [0, 1, 2, 3].forEach(i => {
    const a = i * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

const ICON_FNS = [iconLeaf, iconSparkle, iconButton] as const;

// ── Main draw function ────────────────────────────────────────────────────────

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  style: TemplateStyle,
) {
  const W = CARD_W, H = CARD_H;
  const t = T[style];
  const PAD = 66;
  const TEXT_W = 370;

  // ── 1. Photo: full-bleed, object-cover ────────────────────────────────────
  const sx = W / img.naturalWidth, sy = H / img.naturalHeight;
  const sc = Math.max(sx, sy);
  const dW = img.naturalWidth * sc, dH = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);

  // ── 2. Scrim: elegant fade from left ──────────────────────────────────────
  // Strong near left (text lives here), completely transparent by right edge
  const scrim = ctx.createLinearGradient(0, 0, W * 0.72, 0);
  scrim.addColorStop(0,    `rgba(${t.scrimRgb},${t.scrimA})`);
  scrim.addColorStop(0.38, `rgba(${t.scrimRgb},${t.scrimA * 0.78})`);
  scrim.addColorStop(0.62, `rgba(${t.scrimRgb},${t.scrimA * 0.22})`);
  scrim.addColorStop(1,    `rgba(${t.scrimRgb},0)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // Subtle bottom scrim (for bottom text)
  const bScrim = ctx.createLinearGradient(0, H - 130, 0, H);
  bScrim.addColorStop(0, `rgba(${t.scrimRgb},0)`);
  bScrim.addColorStop(1, `rgba(${t.scrimRgb},${t.scrimA * 0.58})`);
  ctx.fillStyle = bScrim;
  ctx.fillRect(0, H - 130, W, 130);

  // ── 3. Typography ─────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 88;

  // Tagline — small, spaced, thin
  ctx.font = '400 11.5px Arial, Helvetica, sans-serif';
  ctx.fillStyle = t.subColor;
  drawSpaced(ctx, data.tagline.toUpperCase(), PAD, y, 2.6);
  y += 36;

  // Product name — italic serif, size scales with name length
  const rawName = data.productName.toUpperCase();
  const nLen = rawName.replace(/\s/g, '').length;
  const NS = nLen <= 6 ? 80 : nLen <= 10 ? 66 : nLen <= 15 ? 54 : 44;
  ctx.font = `italic 700 ${NS}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.textColor;
  ctx.shadowColor = t.shadowColor;
  ctx.shadowBlur = 14;
  const nameLines = wrapText(ctx, rawName, TEXT_W, 3);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += Math.ceil(NS * 1.12);
  }
  ctx.shadowBlur = 0;
  y += 16;

  // Subtitle — thin italic, smaller
  if (data.productSubtitle) {
    ctx.font = 'italic 300 16px Arial, Helvetica, sans-serif';
    ctx.fillStyle = t.subColor;
    ctx.fillText(data.productSubtitle, PAD, y);
    y += 44;
  }

  // Thin decorative rule — short gold line
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 50, y);
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.52;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 28;

  // ── 4. Feature pills ──────────────────────────────────────────────────────
  const PILL_H = 58;
  const PILL_W = 295;
  const PILL_R = 29;   // fully rounded (= PILL_H / 2)
  const ICON_CX_OFFSET = 36; // center of icon from pill left
  const ICON_R = 13;
  const ICON_DOT_R = 11; // circle behind icon

  const chars = data.characteristics.slice(0, 3);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const px = PAD;
    const py = y;

    // Pill body
    roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
    ctx.fillStyle = t.pillBg;
    ctx.fill();
    roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
    ctx.strokeStyle = t.stroke;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.20;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Icon circle background
    const iconCX = px + ICON_CX_OFFSET;
    const iconCY = py + PILL_H / 2;
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, ICON_DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = t.pillIconBg;
    ctx.fill();

    // Icon
    ICON_FNS[i % 3](ctx, iconCX, iconCY, ICON_R * 0.64, t.accent);

    // Text (title + optional sub-value)
    const textX = px + ICON_CX_OFFSET + ICON_DOT_R + 14;
    const maxTW = PILL_W - (ICON_CX_OFFSET + ICON_DOT_R + 14) - 14;
    const hasVal = !!ch.value;
    ctx.textBaseline = 'middle';

    if (hasVal) {
      ctx.font = '600 13px Arial, Helvetica, sans-serif';
      ctx.fillStyle = t.textColor;
      ctx.fillText(ch.title, textX, iconCY - 9);

      ctx.font = '400 11px Arial, Helvetica, sans-serif';
      ctx.fillStyle = t.subColor;
      const val = wrapText(ctx, ch.value, maxTW, 1)[0] ?? ch.value;
      ctx.fillText(val, textX, iconCY + 9);
    } else {
      ctx.font = '500 13px Arial, Helvetica, sans-serif';
      ctx.fillStyle = t.textColor;
      ctx.fillText(ch.title, textX, iconCY);
    }
    ctx.textBaseline = 'top';
    y += PILL_H + 13;
  }

  // ── 5. Bottom text ────────────────────────────────────────────────────────
  if (data.bottomText) {
    const btY = H - 60;
    const btSz = 14;
    ctx.font = `italic 300 ${btSz}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subColor;
    ctx.textBaseline = 'top';
    const btLines = wrapText(ctx, data.bottomText, TEXT_W - 20, 2);
    let bty = btY;
    for (const bl of btLines) {
      ctx.fillText(bl, PAD, bty);
      bty += btSz + 4;
    }
  }
}

// ── Proxy helper (avoids canvas CORS taint) ───────────────────────────────────

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

// ── React component ───────────────────────────────────────────────────────────

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
    ['dark',  'Тёмный',  'bg-zinc-900 text-zinc-100 border border-zinc-700'],
    ['beige', 'Бежевый', 'bg-amber-100 text-amber-950 border border-amber-300'],
    ['black', 'Чёрный',  'bg-black text-yellow-300 border border-yellow-700'],
  ];

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-4">

        {/* Result preview */}
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
                  <button
                    onClick={() => { const a = document.createElement('a'); a.href = resultUrl!; a.download = 'wb-card.jpg'; a.click(); }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                  >
                    ⬇ Скачать
                  </button>
                  <button
                    onClick={() => setResultUrl(null)}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
                  >
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

          <button
            onClick={handleRender}
            disabled={!imageUrl || rendering}
            className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {rendering ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</> : '✨ Создать карточку товара'}
          </button>

          {/* Template selector */}
          <div className="mt-2 flex gap-1 flex-wrap">
            {TMPL.map(([t, label, cls]) => (
              <button
                key={t}
                onClick={() => { setTemplate(t); setResultUrl(null); }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${cls} ${template === t ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-90'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor panel */}
        <div className="w-60 shrink-0 flex flex-col gap-3">
          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Текст</span>
              <button
                onClick={generateAIText}
                disabled={loadingText}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1"
              >
                {loadingText ? <Loader2 className="h-3 w-3 animate-spin" /> : '✨'} AI
              </button>
            </div>
            <input
              value={data.tagline}
              onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
              placeholder="тег (новинка / хит продаж)"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
            />
            <input
              value={data.productName}
              onChange={e => setData(p => ({ ...p, productName: e.target.value }))}
              placeholder="НАЗВАНИЕ ТОВАРА"
              className="w-full bg-zinc-700 text-white text-sm font-bold px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500"
            />
            <input
              value={data.productSubtitle}
              onChange={e => setData(p => ({ ...p, productSubtitle: e.target.value }))}
              placeholder="лёгкий и дышащий"
              className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
            />
          </div>

          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Характеристики</span>
            {data.characteristics.map((ch, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-zinc-700/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 w-3 shrink-0">{['🌿','✦','◉'][i]}</span>
                  <input
                    value={ch.title}
                    onChange={e => updateChar(i, 'title', e.target.value)}
                    placeholder="Название"
                    className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <input
                  value={ch.value}
                  onChange={e => updateChar(i, 'value', e.target.value)}
                  placeholder="уточнение"
                  className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-4"
                />
              </div>
            ))}
          </div>

          <div className="bg-zinc-800 rounded-xl p-3">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1.5 block">Подпись внизу</span>
            <input
              value={data.bottomText}
              onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
              placeholder="стиль и качество"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
