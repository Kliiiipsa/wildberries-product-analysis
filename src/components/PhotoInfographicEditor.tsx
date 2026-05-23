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
  productName: 'ТОВАР',
  productSubtitle: 'описание товара',
  tagline: 'новинка',
  characteristics: [
    { title: 'ХАРАКТЕРИСТИКА 1', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 2', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 3', value: 'описание' },
  ],
  bottomText: 'подпись внизу',
};

const TEMPLATES: Record<TemplateStyle, {
  panelBg: string; textColor: string; subtitleColor: string;
  accentColor: string; circleStroke: string; tagBg: string;
  tagText: string; sectionLabel: string; charBadgeBg: string;
  panelRgb: string;
}> = {
  light: {
    panelBg: '#F9F6F1', panelRgb: '249,246,241',
    textColor: '#1A1A1A', subtitleColor: 'rgba(30,30,30,0.55)',
    accentColor: '#8B6F3A', circleStroke: '#C4973C',
    tagBg: 'rgba(139,111,58,0.1)', tagText: '#8B6F3A',
    sectionLabel: 'rgba(30,30,30,0.35)', charBadgeBg: '#EDE5D4',
  },
  dark: {
    panelBg: '#0F0E12', panelRgb: '15,14,18',
    textColor: '#F0EDE8', subtitleColor: 'rgba(240,237,232,0.5)',
    accentColor: '#C9A96E', circleStroke: '#C9A96E',
    tagBg: 'rgba(201,169,110,0.12)', tagText: '#C9A96E',
    sectionLabel: 'rgba(240,237,232,0.3)', charBadgeBg: 'rgba(201,169,110,0.1)',
  },
  beige: {
    panelBg: '#F0E8DA', panelRgb: '240,232,218',
    textColor: '#2C1F0E', subtitleColor: 'rgba(44,31,14,0.5)',
    accentColor: '#8B5E30', circleStroke: '#A0723E',
    tagBg: 'rgba(139,94,48,0.1)', tagText: '#8B5E30',
    sectionLabel: 'rgba(44,31,14,0.35)', charBadgeBg: '#E4D4BC',
  },
  black: {
    panelBg: '#000000', panelRgb: '0,0,0',
    textColor: '#FFFFFF', subtitleColor: 'rgba(255,255,255,0.5)',
    accentColor: '#E0C97A', circleStroke: '#E0C97A',
    tagBg: 'rgba(224,201,122,0.12)', tagText: '#E0C97A',
    sectionLabel: 'rgba(255,255,255,0.35)', charBadgeBg: 'rgba(224,201,122,0.1)',
  },
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 99): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      if (lines.length >= maxLines) return lines;
      current = word;
    } else current = test;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
  const t = TEMPLATES[style];
  const pad = 52;

  // ── Full background ─────────────────────────────────────────────────────────
  ctx.fillStyle = t.panelBg;
  ctx.fillRect(0, 0, W, H);

  // ── HEADER (0–72) — tagline badge + decorative dots ─────────────────────────
  const hdrH = 72;

  const tagFontSz = 18;
  ctx.font = `700 ${tagFontSz}px Arial, Helvetica, sans-serif`;
  const tagStr = data.tagline.toUpperCase();
  const tagTextW = ctx.measureText(tagStr).width;
  const tagPadX = 16, tagPadY = 10;
  const tagW = tagTextW + tagPadX * 2;
  const tagH = tagFontSz + tagPadY * 2;
  const tagX = pad, tagY = (hdrH - tagH) / 2;

  roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
  ctx.fillStyle = t.tagBg; ctx.fill();
  roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
  ctx.strokeStyle = t.accentColor; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.tagText; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tagStr, tagX + tagPadX, tagY + tagH / 2);

  // Dot grid (top-right corner of header)
  const dotS = 13;
  for (let dx = 0; dx < 5; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      ctx.beginPath();
      ctx.arc(W - pad - dx * dotS, hdrH / 2 - dotS + dy * dotS, 2, 0, Math.PI * 2);
      ctx.fillStyle = t.circleStroke; ctx.globalAlpha = 0.2; ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── ACCENT STRIPE (72–80) ───────────────────────────────────────────────────
  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, hdrH, W, 8);

  // ── PHOTO AREA (80–720) — object-cover, clipped ─────────────────────────────
  const photoY = hdrH + 8;
  const photoH = 640;

  ctx.save();
  ctx.beginPath(); ctx.rect(0, photoY, W, photoH); ctx.clip();

  const scaleX = W / img.naturalWidth;
  const scaleY = photoH / img.naturalHeight;
  const scale = Math.max(scaleX, scaleY);
  const drawnW = img.naturalWidth * scale;
  const drawnH = img.naturalHeight * scale;
  ctx.drawImage(img, (W - drawnW) / 2, photoY + (photoH - drawnH) / 2, drawnW, drawnH);
  ctx.restore();

  // Gradient fade: photo → panel background
  const fadeH = 110;
  const fadeGrad = ctx.createLinearGradient(0, photoY + photoH - fadeH, 0, photoY + photoH);
  fadeGrad.addColorStop(0, `rgba(${t.panelRgb},0)`);
  fadeGrad.addColorStop(1, `rgb(${t.panelRgb})`);
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, photoY + photoH - fadeH, W, fadeH);

  // ── TEXT PANEL (720–1140) ───────────────────────────────────────────────────
  const textStartY = photoY + photoH; // = 728
  let y = textStartY + 14;

  // Product name (max 2 lines)
  const nameFontSz = 64;
  ctx.font = `900 ${nameFontSz}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const nameLines = wrapText(ctx, data.productName.toUpperCase(), W - pad * 2, 2);
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += Math.ceil(nameFontSz * 1.06);
  }
  y += 6;

  // Subtitle
  const subFontSz = 22;
  ctx.font = `italic ${subFontSz}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.fillText(data.productSubtitle, pad, y);
  y += subFontSz + 18;

  // Diamond divider
  const dvX1 = pad, dvX2 = W - pad, dvMid = (dvX1 + dvX2) / 2;
  const dvY = y + 4, dSz = 5;
  ctx.beginPath(); ctx.moveTo(dvX1, dvY); ctx.lineTo(dvMid - dSz * 1.8, dvY);
  ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1; ctx.globalAlpha = 0.35; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(dvMid + dSz * 1.8, dvY); ctx.lineTo(dvX2, dvY); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(dvMid, dvY - dSz); ctx.lineTo(dvMid + dSz, dvY);
  ctx.lineTo(dvMid, dvY + dSz); ctx.lineTo(dvMid - dSz, dvY);
  ctx.closePath(); ctx.fillStyle = t.circleStroke; ctx.fill();
  y += 24;

  // Characteristics label
  const labelSz = 13;
  ctx.font = `600 ${labelSz}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.sectionLabel; ctx.textBaseline = 'top';
  ctx.fillText('ХАРАКТЕРИСТИКИ', pad, y);
  y += labelSz + 12;

  // 3 characteristic rows
  const chars = data.characteristics.slice(0, 3);
  const badgeSz = 44, charTitleSz = 20, charValSz = 15, charRowH = 60;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Numbered badge
    roundRect(ctx, pad, y, badgeSz, badgeSz, 8);
    ctx.fillStyle = t.charBadgeBg; ctx.fill();
    roundRect(ctx, pad, y, badgeSz, badgeSz, 8);
    ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45; ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = `bold ${Math.round(badgeSz * 0.52)}px Arial`;
    ctx.fillStyle = t.accentColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), pad + badgeSz / 2, y + badgeSz / 2 + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Title + value text
    const tx = pad + badgeSz + 16;
    const tMaxW = W - pad - badgeSz - 16 - pad;
    const titleY = y + (badgeSz - charTitleSz - charValSz - 4) / 2;

    ctx.font = `700 ${charTitleSz}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.fillText(ch.title.toUpperCase(), tx, titleY);

    if (ch.value) {
      ctx.font = `${charValSz}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subtitleColor;
      const vLines = wrapText(ctx, ch.value, tMaxW, 2);
      let vy = titleY + charTitleSz + 4;
      for (const vl of vLines) { ctx.fillText(vl, tx, vy); vy += charValSz + 2; }
    }

    y += charRowH;
  }

  // ── BOTTOM STRIP (fixed at H-8-50 = 1142) ──────────────────────────────────
  const bottomStripH = 50;
  const bottomStripY = H - 8 - bottomStripH;

  ctx.fillStyle = t.tagBg;
  ctx.fillRect(0, bottomStripY, W, bottomStripH);

  if (data.bottomText) {
    const btSz = 17;
    ctx.font = `italic ${btSz}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subtitleColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(data.bottomText, W / 2, bottomStripY + bottomStripH / 2);
    ctx.textAlign = 'left';
  }

  // ── BOTTOM ACCENT BAR ───────────────────────────────────────────────────────
  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, H - 8, W, 8);
}

// Convert any external URL to data URL via proxy (CORS-safe)
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

  // ── AI text generation ───────────────────────────────────────────────────────
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

  // ── Render card to canvas → JPEG data URL ───────────────────────────────────
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
        resolve(canvas.toDataURL('image/jpeg', 0.96));
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
      const dataUrl = await renderCard();
      setResultUrl(dataUrl);
      onExport?.(dataUrl);
    } catch (e) {
      setRenderError(String(e));
    } finally {
      setRendering(false);
    }
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'wb-card.jpg';
    a.click();
  };

  const updateChar = (i: number, field: 'title' | 'value', val: string) => {
    setData(prev => {
      const chars = [...prev.characteristics];
      chars[i] = { ...chars[i], [field]: val };
      return { ...prev, characteristics: chars };
    });
  };

  const TEMPLATE_LABELS: [TemplateStyle, string, string][] = [
    ['light', 'Светлый', 'bg-amber-50 text-amber-900 border border-amber-200'],
    ['dark', 'Тёмный', 'bg-zinc-900 text-zinc-100 border border-zinc-700'],
    ['beige', 'Бежевый', 'bg-amber-100 text-amber-950 border border-amber-300'],
    ['black', 'Чёрный', 'bg-black text-yellow-300 border border-yellow-700'],
  ];

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-4">
        {/* ── Result area ── */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden max-h-[500px] min-h-[240px] relative flex items-center justify-center">
            {rendering ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">Создаю карточку...</p>
              </div>
            ) : resultUrl ? (
              <>
                <img src={resultUrl} alt="Карточка товара" className="w-full h-full object-contain" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={downloadResult}
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
                <p className="text-sm font-medium text-zinc-500">Заполните поля справа</p>
                <p className="text-xs mt-1 text-zinc-600">и нажмите «Создать карточку»</p>
              </div>
            )}
          </div>

          {renderError && (
            <div className="mt-2 rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">
              {renderError}
            </div>
          )}

          <div className="mt-3">
            <button
              onClick={handleRender}
              disabled={!imageUrl || rendering}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {rendering
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</>
                : '✨ Создать карточку товара'}
            </button>
          </div>

          <div className="mt-2 flex gap-1 flex-wrap">
            {TEMPLATE_LABELS.map(([t, label, cls]) => (
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

        {/* ── Editor panel ── */}
        <div className="w-60 shrink-0 flex flex-col gap-3">
          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Текст</div>
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
              placeholder="подзаголовок / описание"
              className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
            />
          </div>

          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Характеристики</div>
            {data.characteristics.map((ch, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-zinc-700/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 w-4 shrink-0">{i + 1}.</span>
                  <input
                    value={ch.title}
                    onChange={e => updateChar(i, 'title', e.target.value)}
                    placeholder="ЗАГОЛОВОК"
                    className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <input
                  value={ch.value}
                  onChange={e => updateChar(i, 'value', e.target.value)}
                  placeholder="уточнение"
                  className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-5"
                />
              </div>
            ))}
          </div>

          <div className="bg-zinc-800 rounded-xl p-3">
            <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1.5">Подпись внизу</div>
            <input
              value={data.bottomText}
              onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
              placeholder="финальный акцент"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
            />
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-3 text-xs text-zinc-500 leading-relaxed">
            <p className="font-medium text-zinc-400 mb-1">Как работает</p>
            <p>1. Заполните поля (или нажмите ✨ AI)</p>
            <p className="mt-0.5">2. Выберите цветовую тему</p>
            <p className="mt-0.5">3. Нажмите «Создать карточку»</p>
          </div>
        </div>
      </div>
    </div>
  );
}
