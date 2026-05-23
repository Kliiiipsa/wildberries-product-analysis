'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

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

type TemplateStyle = 'light' | 'dark' | 'beige';

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  onExport?: (dataUrl: string) => void;
}

const DEFAULT_DATA: InfographicData = {
  productName: 'ТОВАР',
  productSubtitle: 'описание',
  tagline: 'новинка',
  characteristics: [
    { title: 'ХАРАКТЕРИСТИКА 1', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 2', value: 'описание' },
    { title: 'ХАРАКТЕРИСТИКА 3', value: 'описание' },
  ],
  bottomText: 'подпись внизу',
};

const TEMPLATES: Record<TemplateStyle, { overlayBg: string; textColor: string; subtitleColor: string; accentColor: string; circleStroke: string }> = {
  light: {
    overlayBg: 'rgba(255,252,248,0.94)',
    textColor: '#1a1a1a',
    subtitleColor: 'rgba(30,30,30,0.55)',
    accentColor: '#7a5c2a',
    circleStroke: '#b8922e',
  },
  dark: {
    overlayBg: 'rgba(12,12,14,0.91)',
    textColor: '#f0ede8',
    subtitleColor: 'rgba(240,237,232,0.55)',
    accentColor: '#c9a96e',
    circleStroke: '#c9a96e',
  },
  beige: {
    overlayBg: 'rgba(243,236,224,0.96)',
    textColor: '#2c1f0e',
    subtitleColor: 'rgba(44,31,14,0.5)',
    accentColor: '#8b6030',
    circleStroke: '#a07040',
  },
};

function wrapTextCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) { lines.push(current); current = word; }
    else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

function drawInfographic(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  data: InfographicData,
  style: TemplateStyle
) {
  const t = TEMPLATES[style];
  const overlayW = Math.round(w * 0.52);
  const pad = Math.round(w * 0.038);

  // Photo background
  ctx.drawImage(img, 0, 0, w, h);

  // Left overlay — solid rect
  ctx.fillStyle = t.overlayBg;
  ctx.fillRect(0, 0, overlayW, h);

  // Soft gradient fade on right edge of overlay
  const fadeW = Math.round(w * 0.04);
  const grad = ctx.createLinearGradient(overlayW - fadeW, 0, overlayW, 0);
  grad.addColorStop(0, t.overlayBg);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(overlayW - fadeW, 0, fadeW, h);

  const maxTextW = overlayW - pad * 2 - fadeW;

  let y = Math.round(h * 0.06);

  // ── Tagline (small italic, accent color) ──
  ctx.font = `italic ${Math.round(h * 0.018)}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.accentColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(data.tagline, pad, y);
  y += Math.round(h * 0.035);

  // ── Product name (large bold) ──
  const nameSize = Math.round(h * 0.068);
  ctx.font = `900 ${nameSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor;
  const nameLines = wrapTextCanvas(ctx, data.productName.toUpperCase(), maxTextW);
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(nameSize * 1.1);
  }

  // ── Product subtitle (italic, muted) ──
  const subSize = Math.round(h * 0.024);
  ctx.font = `italic ${subSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.fillText(data.productSubtitle, pad, y);
  y += Math.round(h * 0.03);

  // ── Accent line ──
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(overlayW - pad - fadeW, y);
  ctx.strokeStyle = t.circleStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  y += Math.round(h * 0.035);

  // ── Characteristics ──
  const chars = data.characteristics.slice(0, 3);
  const circleR = Math.round(h * 0.034);
  const charTitleSize = Math.round(h * 0.02);
  const charValSize = Math.round(h * 0.016);
  const charSpacing = Math.round(h * 0.145);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cx = pad + circleR;
    const cy = y + circleR;

    // Circle
    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.strokeStyle = t.circleStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number inside circle
    ctx.font = `bold ${Math.round(circleR * 0.9)}px Arial, sans-serif`;
    ctx.fillStyle = t.accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const tx = cx + circleR + Math.round(w * 0.018);
    const tMaxW = maxTextW - circleR * 2 - Math.round(w * 0.02);

    // Title
    ctx.font = `bold ${charTitleSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.fillText(ch.title.toUpperCase(), tx, y + 4);

    // Value
    if (ch.value) {
      ctx.font = `${charValSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subtitleColor;
      const valLines = wrapTextCanvas(ctx, ch.value, tMaxW);
      let vy = y + charTitleSize + 8;
      for (const vl of valLines) {
        ctx.fillText(vl, tx, vy);
        vy += charValSize + 3;
      }
    }

    y += charSpacing;
  }

  // ── Bottom text ──
  if (data.bottomText) {
    const btSize = Math.round(h * 0.018);
    const btY = h - Math.round(h * 0.06);

    // Small accent line above
    ctx.beginPath();
    ctx.moveTo(pad, btY - 10);
    ctx.lineTo(pad + Math.round(w * 0.06), btY - 10);
    ctx.strokeStyle = t.circleStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `italic ${btSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subtitleColor;
    ctx.textBaseline = 'top';
    const btLines = wrapTextCanvas(ctx, data.bottomText, maxTextW);
    let by = btY;
    for (const bl of btLines) {
      ctx.fillText(bl, pad, by);
      by += btSize + 4;
    }
  }
}

export default function PhotoInfographicEditor({ imageUrl, analysis, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 500, h: 700 });
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [template, setTemplate] = useState<TemplateStyle>('light');
  const [loading, setLoading] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawInfographic(ctx, img, canvas.width, canvas.height, data, template);
  }, [data, template]);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 520;
      const scale = maxW / img.naturalWidth;
      const h = Math.round(img.naturalHeight * scale);
      setCanvasSize({ w: maxW, h });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw on data/template change or size change
  useEffect(() => { redraw(); }, [redraw, canvasSize]);

  const generateAI = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/jpeg', 0.95);
    onExport?.(url);
    const a = document.createElement('a');
    a.href = url; a.download = 'infographic.jpg'; a.click();
  };

  const updateChar = (i: number, field: 'title' | 'value', val: string) => {
    setData(prev => {
      const chars = [...prev.characteristics];
      chars[i] = { ...chars[i], [field]: val };
      return { ...prev, characteristics: chars };
    });
  };

  return (
    <div className="flex gap-4">
      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={generateAI}
            disabled={loading}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? '⏳ Генерирую...' : '✨ Заполнить текст (AI)'}
          </button>
          {/* Template selector */}
          <div className="flex gap-1 ml-auto">
            {([['light', 'Светлый'], ['dark', 'Тёмный'], ['beige', 'Бежевый']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${template === t ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-90'} ${t === 'dark' ? 'bg-zinc-900 text-white' : t === 'beige' ? 'bg-amber-100 text-amber-900' : 'bg-white text-zinc-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={exportImage}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
          >
            ⬇ Скачать
          </button>
        </div>

        <div className="border border-zinc-700 rounded-xl overflow-hidden" style={{ lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="max-w-full block"
          />
        </div>
      </div>

      {/* Editor panel */}
      <div className="w-60 shrink-0 flex flex-col gap-3">
        <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Название</div>
          <input
            value={data.tagline}
            onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
            placeholder="тег (летняя коллекция)"
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
            placeholder="подзаголовок"
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
      </div>
    </div>
  );
}
