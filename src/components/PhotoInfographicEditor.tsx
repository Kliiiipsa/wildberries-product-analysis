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
  productSubtitle: 'на каждый день',
  tagline: 'новинка',
  characteristics: [
    { title: 'ХАРАКТЕРИСТИКА 1', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 2', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 3', value: 'описание' },
  ],
  bottomText: 'стиль и качество в каждой детали',
};

const TEMPLATES: Record<TemplateStyle, {
  panelBg: string; textColor: string; subtitleColor: string;
  accentColor: string; circleStroke: string;
  tagBg: string; tagText: string; charBadgeBg: string;
}> = {
  light: {
    panelBg: '#F8F5F0',
    textColor: '#1A1A1A', subtitleColor: 'rgba(26,26,26,0.52)',
    accentColor: '#9C7A3C', circleStroke: '#C49A3C',
    tagBg: 'rgba(156,122,60,0.09)', tagText: '#9C7A3C', charBadgeBg: '#EDE5D4',
  },
  dark: {
    panelBg: '#111014',
    textColor: '#F0EDE8', subtitleColor: 'rgba(240,237,232,0.48)',
    accentColor: '#C9A96E', circleStroke: '#C9A96E',
    tagBg: 'rgba(201,169,110,0.13)', tagText: '#C9A96E', charBadgeBg: 'rgba(201,169,110,0.1)',
  },
  beige: {
    panelBg: '#EFE7D9',
    textColor: '#2C1F0E', subtitleColor: 'rgba(44,31,14,0.48)',
    accentColor: '#8B5E30', circleStroke: '#A0723E',
    tagBg: 'rgba(139,94,48,0.1)', tagText: '#8B5E30', charBadgeBg: '#E4D4BC',
  },
  black: {
    panelBg: '#000000',
    textColor: '#FFFFFF', subtitleColor: 'rgba(255,255,255,0.48)',
    accentColor: '#E0C97A', circleStroke: '#E0C97A',
    tagBg: 'rgba(224,201,122,0.13)', tagText: '#E0C97A', charBadgeBg: 'rgba(224,201,122,0.1)',
  },
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 99): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
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

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

  // Layout constants
  const SPLIT = 420;       // where text panel ends, photo begins
  const BLEND = 90;        // gradient blend width (overlap of text panel into photo)
  const ACCENT = 8;        // left accent stripe width
  const PAD = 56;          // text left padding (after accent stripe)
  const TEXT_MAX_X = SPLIT - 28; // right edge of text content
  const TEXT_W = TEXT_MAX_X - PAD;

  // ── 1. Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = t.panelBg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Photo — right side, anchored left, full height ─────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(SPLIT, 0, W - SPLIT, H);
  ctx.clip();

  // Scale photo to fill full height; anchor its LEFT edge to SPLIT so we see
  // the left portion of the photo (where the model/product typically is).
  const scale = H / img.naturalHeight;
  const drawnW = img.naturalWidth * scale;
  ctx.drawImage(img, SPLIT, 0, drawnW, H);
  ctx.restore();

  // ── 3. Gradient blend: panel bg → transparent, softening the photo edge ───
  const gx0 = SPLIT - 10;
  const gx1 = SPLIT + BLEND;
  const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
  g.addColorStop(0, t.panelBg);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(gx0, 0, gx1 - gx0, H);

  // ── 4. Accent stripe ───────────────────────────────────────────────────────
  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, 0, ACCENT, H);

  // ── 5. Text content ────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 72;

  // 5a. Tagline (small caps, muted)
  const TAG_SZ = 13;
  ctx.font = `600 ${TAG_SZ}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.fillText(data.tagline.toUpperCase(), PAD, y);
  y += TAG_SZ + 28;

  // 5b. Product name — dominant element
  const NAME_SZ = 88;
  const NAME_LH = Math.ceil(NAME_SZ * 1.02);
  ctx.font = `900 ${NAME_SZ}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor;
  const nameLines = wrapText(ctx, data.productName.toUpperCase(), TEXT_W, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += NAME_LH;
  }
  y += 22;

  // 5c. Subtitle badge — horizontal pill
  const SUB_SZ = 14;
  ctx.font = `600 ${SUB_SZ}px Arial, Helvetica, sans-serif`;
  const subStr = data.productSubtitle.toUpperCase();
  const subTW = ctx.measureText(subStr).width;
  const subPX = 14, subPY = 9;
  const subBW = Math.min(subTW + subPX * 2, TEXT_W);
  const subBH = SUB_SZ + subPY * 2;

  rrect(ctx, PAD, y, subBW, subBH, 3);
  ctx.fillStyle = t.tagBg; ctx.fill();
  rrect(ctx, PAD, y, subBW, subBH, 3);
  ctx.strokeStyle = t.accentColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.45; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.tagText;
  ctx.textBaseline = 'middle';
  ctx.fillText(subStr, PAD + subPX, y + subBH / 2);
  ctx.textBaseline = 'top';
  y += subBH + 48;

  // 5d. Characteristics — numbered badges
  const chars = data.characteristics.slice(0, 3);
  const BADGE = 42;
  const CHAR_TITLE_SZ = 17;
  const CHAR_VAL_SZ = 14;
  const CHAR_ROW_H = 80;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Badge square
    rrect(ctx, PAD, y, BADGE, BADGE, 8);
    ctx.fillStyle = t.charBadgeBg; ctx.fill();
    rrect(ctx, PAD, y, BADGE, BADGE, 8);
    ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.38; ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = `bold ${Math.round(BADGE * 0.50)}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.accentColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), PAD + BADGE / 2, y + BADGE / 2 + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Title + value
    const TX = PAD + BADGE + 16;
    const TW = TEXT_W - BADGE - 16;
    const titleY = y + (BADGE - CHAR_TITLE_SZ - (ch.value ? CHAR_VAL_SZ + 3 : 0)) / 2;

    ctx.font = `700 ${CHAR_TITLE_SZ}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.fillText(ch.title.toUpperCase(), TX, titleY);

    if (ch.value) {
      ctx.font = `${CHAR_VAL_SZ}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subtitleColor;
      const vls = wrapText(ctx, ch.value, TW, 2);
      let vy = titleY + CHAR_TITLE_SZ + 3;
      for (const vl of vls) { ctx.fillText(vl, TX, vy); vy += CHAR_VAL_SZ + 2; }
    }
    y += CHAR_ROW_H;
  }

  // ── 6. Bottom text — anchored to base of card ──────────────────────────────
  if (data.bottomText) {
    const BT_SZ = 18;
    const btY = H - 88;

    // Thin rule above
    ctx.beginPath();
    ctx.moveTo(PAD, btY - 18); ctx.lineTo(TEXT_MAX_X, btY - 18);
    ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1; ctx.globalAlpha = 0.22; ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = `italic ${BT_SZ}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subtitleColor; ctx.textBaseline = 'top';
    const btLines = wrapText(ctx, data.bottomText, TEXT_W, 2);
    let bty = btY;
    for (const bl of btLines) { ctx.fillText(bl, PAD, bty); bty += BT_SZ + 5; }
  }

  // ── 7. Bottom accent bar (left panel only) ─────────────────────────────────
  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, H - 8, SPLIT, 8);
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

  const TMPL_LABELS: [TemplateStyle, string, string][] = [
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
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden max-h-[500px] min-h-[240px] relative flex items-center justify-center">
            {rendering ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">Создаю карточку...</p>
              </div>
            ) : resultUrl ? (
              <>
                <img src={resultUrl} alt="Карточка" className="w-full h-full object-contain" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button onClick={downloadResult}
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

          <button
            onClick={handleRender}
            disabled={!imageUrl || rendering}
            className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {rendering
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</>
              : '✨ Создать карточку товара'}
          </button>

          <div className="mt-2 flex gap-1 flex-wrap">
            {TMPL_LABELS.map(([t, label, cls]) => (
              <button key={t}
                onClick={() => { setTemplate(t); setResultUrl(null); }}
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
            <input value={data.tagline}
              onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
              placeholder="тег (новинка / хит продаж)"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
            <input value={data.productName}
              onChange={e => setData(p => ({ ...p, productName: e.target.value }))}
              placeholder="НАЗВАНИЕ ТОВАРА"
              className="w-full bg-zinc-700 text-white text-sm font-bold px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500" />
            <input value={data.productSubtitle}
              onChange={e => setData(p => ({ ...p, productSubtitle: e.target.value }))}
              placeholder="на каждый день"
              className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
          </div>

          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Характеристики</span>
            {data.characteristics.map((ch, i) => (
              <div key={i} className="flex flex-col gap-1 border-b border-zinc-700/60 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500 w-4 shrink-0">{i + 1}.</span>
                  <input value={ch.title}
                    onChange={e => updateChar(i, 'title', e.target.value)}
                    placeholder="ЗАГОЛОВОК"
                    className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <input value={ch.value}
                  onChange={e => updateChar(i, 'value', e.target.value)}
                  placeholder="уточнение"
                  className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-5" />
              </div>
            ))}
          </div>

          <div className="bg-zinc-800 rounded-xl p-3">
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1.5 block">Подпись внизу</span>
            <input value={data.bottomText}
              onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
              placeholder="стиль и качество"
              className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
