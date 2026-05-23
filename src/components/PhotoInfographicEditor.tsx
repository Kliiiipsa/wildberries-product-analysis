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

type TemplateStyle = 'light' | 'dark' | 'beige' | 'black';

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  generatePrompt?: string;
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

const TEMPLATES: Record<TemplateStyle, {
  overlayBg: string;
  textColor: string;
  subtitleColor: string;
  accentColor: string;
  circleStroke: string;
  tagBg: string;
  tagText: string;
  bottomBg: string;
}> = {
  light: {
    overlayBg: 'rgba(252,249,244,0.96)',
    textColor: '#1a1a1a',
    subtitleColor: 'rgba(30,30,30,0.5)',
    accentColor: '#7a5c2a',
    circleStroke: '#c49a3c',
    tagBg: 'rgba(122,92,42,0.12)',
    tagText: '#7a5c2a',
    bottomBg: 'rgba(122,92,42,0.06)',
  },
  dark: {
    overlayBg: 'rgba(10,10,12,0.93)',
    textColor: '#f0ede8',
    subtitleColor: 'rgba(240,237,232,0.5)',
    accentColor: '#c9a96e',
    circleStroke: '#c9a96e',
    tagBg: 'rgba(201,169,110,0.15)',
    tagText: '#c9a96e',
    bottomBg: 'rgba(201,169,110,0.06)',
  },
  beige: {
    overlayBg: 'rgba(240,232,218,0.97)',
    textColor: '#2c1f0e',
    subtitleColor: 'rgba(44,31,14,0.45)',
    accentColor: '#8b5e30',
    circleStroke: '#a0723e',
    tagBg: 'rgba(139,94,48,0.12)',
    tagText: '#8b5e30',
    bottomBg: 'rgba(139,94,48,0.07)',
  },
  black: {
    overlayBg: 'rgba(0,0,0,0.97)',
    textColor: '#ffffff',
    subtitleColor: 'rgba(255,255,255,0.45)',
    accentColor: '#e0c97a',
    circleStroke: '#e0c97a',
    tagBg: 'rgba(224,201,122,0.14)',
    tagText: '#e0c97a',
    bottomBg: 'rgba(224,201,122,0.07)',
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
  const panelW = Math.round(w * 0.50);
  const stripeW = Math.round(w * 0.013);
  const pad = stripeW + Math.round(w * 0.038);
  const fadeW = Math.round(w * 0.055);
  const maxTextW = panelW - pad - Math.round(w * 0.018);

  // ── Photo background ──
  ctx.drawImage(img, 0, 0, w, h);

  // ── Left panel solid ──
  ctx.fillStyle = t.overlayBg;
  ctx.fillRect(0, 0, panelW, h);

  // ── Gradient fade on right edge ──
  const grad = ctx.createLinearGradient(panelW - fadeW, 0, panelW, 0);
  grad.addColorStop(0, t.overlayBg);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(panelW - fadeW, 0, fadeW, h);

  // ── Left accent stripe ──
  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, 0, stripeW, h);

  // ── Subtle dot grid in top-right corner of panel ──
  const dotArea = Math.round(w * 0.10);
  const dotR = 1.2;
  const dotStep = Math.round(w * 0.022);
  for (let dx = 0; dx <= dotArea; dx += dotStep) {
    for (let dy = 0; dy <= dotArea; dy += dotStep) {
      ctx.beginPath();
      ctx.arc(panelW - fadeW - 4 - (dotArea - dx), Math.round(h * 0.032) + dy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = t.circleStroke;
      ctx.globalAlpha = 0.18;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  let y = Math.round(h * 0.058);

  // ── Tagline pill ──
  const tagSize = Math.round(h * 0.017);
  ctx.font = `600 ${tagSize}px Arial, Helvetica, sans-serif`;
  const tagText = data.tagline.toUpperCase();
  const tagTextW = ctx.measureText(tagText).width;
  const tagPadH = Math.round(tagSize * 0.5);
  const tagPadV = Math.round(tagSize * 0.35);
  const tagW = tagTextW + tagPadH * 2;
  const tagH = tagSize + tagPadV * 2;
  const tagR = tagH / 2;

  // pill background
  roundRect(ctx, pad, y, tagW, tagH, tagR);
  ctx.fillStyle = t.tagBg;
  ctx.fill();
  // pill border
  roundRect(ctx, pad, y, tagW, tagH, tagR);
  ctx.strokeStyle = t.accentColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // pill text
  ctx.fillStyle = t.tagText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, pad + tagPadH, y + tagH / 2);
  ctx.textBaseline = 'top';

  y += tagH + Math.round(h * 0.02);

  // ── Product name ──
  const nameSize = Math.round(h * 0.074);
  ctx.font = `900 ${nameSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor;
  ctx.textAlign = 'left';
  const nameLines = wrapTextCanvas(ctx, data.productName.toUpperCase(), maxTextW);
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(nameSize * 1.06);
  }

  // ── Subtitle italic ──
  const subSize = Math.round(h * 0.022);
  ctx.font = `italic ${subSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.fillText(data.productSubtitle, pad, y);
  y += subSize + Math.round(h * 0.022);

  // ── Divider line with center diamond ──
  const lineY = y + 2;
  const lineX1 = pad;
  const lineX2 = panelW - pad - fadeW;
  const midX = (lineX1 + lineX2) / 2;
  const dSize = 4;

  ctx.beginPath();
  ctx.moveTo(lineX1, lineY);
  ctx.lineTo(midX - dSize * 1.6, lineY);
  ctx.strokeStyle = t.circleStroke;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(midX + dSize * 1.6, lineY);
  ctx.lineTo(lineX2, lineY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Diamond center
  ctx.beginPath();
  ctx.moveTo(midX, lineY - dSize);
  ctx.lineTo(midX + dSize, lineY);
  ctx.lineTo(midX, lineY + dSize);
  ctx.lineTo(midX - dSize, lineY);
  ctx.closePath();
  ctx.fillStyle = t.circleStroke;
  ctx.fill();

  y += Math.round(h * 0.036);

  // ── "ХАРАКТЕРИСТИКИ" label ──
  const sectionLabelSize = Math.round(h * 0.014);
  ctx.font = `600 ${sectionLabelSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.textBaseline = 'top';
  ctx.fillText('ХАРАКТЕРИСТИКИ', pad, y);
  y += sectionLabelSize + Math.round(h * 0.016);

  // ── Characteristics ──
  const chars = data.characteristics.slice(0, 3);
  const charTitleSize = Math.round(h * 0.019);
  const charValSize = Math.round(h * 0.015);
  const badgeSize = Math.round(h * 0.036);
  const charSpacing = Math.round(h * 0.118);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const bx = pad;
    const by = y;

    // Badge background
    roundRect(ctx, bx, by, badgeSize, badgeSize, 5);
    ctx.fillStyle = t.tagBg;
    ctx.fill();
    roundRect(ctx, bx, by, badgeSize, badgeSize, 5);
    ctx.strokeStyle = t.circleStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number in badge
    ctx.font = `bold ${Math.round(badgeSize * 0.52)}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), bx + badgeSize / 2, by + badgeSize / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const tx = bx + badgeSize + Math.round(w * 0.018);
    const tMaxW = maxTextW - badgeSize - Math.round(w * 0.02);
    const titleY = by + (badgeSize - charTitleSize) / 2 - 1;

    // Char title
    ctx.font = `700 ${charTitleSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.fillText(ch.title.toUpperCase(), tx, titleY);

    // Char value
    if (ch.value) {
      ctx.font = `${charValSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subtitleColor;
      const valLines = wrapTextCanvas(ctx, ch.value, tMaxW);
      let vy = titleY + charTitleSize + 3;
      for (const vl of valLines) {
        ctx.fillText(vl, tx, vy);
        vy += charValSize + 2;
      }
    }

    y += charSpacing;
  }

  // ── Bottom section ──
  const bottomH = Math.round(h * 0.09);
  const bottomY = h - bottomH;

  // Bottom tinted strip
  ctx.fillStyle = t.bottomBg;
  ctx.fillRect(0, bottomY, panelW, bottomH);

  // Thin top line of bottom
  ctx.beginPath();
  ctx.moveTo(pad, bottomY + 8);
  ctx.lineTo(panelW - pad - fadeW, bottomY + 8);
  ctx.strokeStyle = t.circleStroke;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (data.bottomText) {
    const btSize = Math.round(h * 0.017);
    ctx.font = `italic ${btSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subtitleColor;
    ctx.textBaseline = 'middle';
    const btLines = wrapTextCanvas(ctx, data.bottomText, maxTextW);
    const totalBtH = btLines.length * (btSize + 4);
    let by = bottomY + (bottomH - totalBtH) / 2 + 4;
    for (const bl of btLines) {
      ctx.fillText(bl, pad, by);
      by += btSize + 4;
    }
    ctx.textBaseline = 'top';
  }
}

export default function PhotoInfographicEditor({ imageUrl, analysis, generatePrompt, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 500, h: 700 });
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [template, setTemplate] = useState<TemplateStyle>('light');
  const [loading, setLoading] = useState(false);
  const [fluxLoading, setFluxLoading] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState(imageUrl);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawInfographic(ctx, img, canvas.width, canvas.height, data, template);
  }, [data, template]);

  useEffect(() => { setActiveImageUrl(imageUrl); }, [imageUrl]);

  useEffect(() => {
    if (!activeImageUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 520;
      const scale = maxW / img.naturalWidth;
      const h = Math.round(img.naturalHeight * scale);
      setCanvasSize({ w: maxW, h });
    };
    img.src = activeImageUrl;
  }, [activeImageUrl]);

  // ── Generate infographic background via FLUX ────────────────────────────────
  const generateFluxBackground = async () => {
    if (!imageUrl) return;
    setFluxLoading(true);
    try {
      // Extract [PRESERVE] from existing prompt or build a generic one
      const preserveSection = generatePrompt
        ? (generatePrompt.split(/\[CHANGE\]|\[SCENE\]|\[QUALITY\]/)[0] ?? '')
        : '';

      const fluxPrompt = `${preserveSection} [CHANGE] Change only: recompose the shot for a WB marketplace product card — position the model/product to the RIGHT half of the frame, keep the LEFT 45% clean with a smooth studio background (no model, no props). [SCENE] Clean bright studio, smooth gradient background (white fading to soft light grey), soft wrap lighting from the left, product sharp and well-lit, left panel area completely empty and clean for text overlay. WB Premium Card Style, commercial e-commerce product photography. [QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural studio light, no AI artifacts, real film grain.`;

      const res = await fetch('/api/photo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt: fluxPrompt }),
      });
      const json = await res.json();
      if (json.imageUrl) setActiveImageUrl(json.imageUrl);
    } catch { /* ignore */ } finally {
      setFluxLoading(false);
    }
  };

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
    const url = canvas.toDataURL('image/jpeg', 0.96);
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

  const TEMPLATE_LABELS: [TemplateStyle, string, string][] = [
    ['light', 'Светлый', 'bg-amber-50 text-amber-900 border border-amber-200'],
    ['dark', 'Тёмный', 'bg-zinc-900 text-zinc-100 border border-zinc-700'],
    ['beige', 'Бежевый', 'bg-amber-100 text-amber-950 border border-amber-300'],
    ['black', 'Чёрный', 'bg-black text-yellow-300 border border-yellow-700'],
  ];

  return (
    <div className="flex gap-4">
      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={generateAI}
            disabled={loading || fluxLoading}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? '⏳ Генерирую...' : '✨ Текст (AI)'}
          </button>
          <button
            onClick={generateFluxBackground}
            disabled={fluxLoading || loading}
            title="FLUX перекомпонует фото: товар вправо, левая половина чистая — идеально для инфографики"
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {fluxLoading ? '⏳ FLUX...' : '🎨 Улучшить фон (FLUX)'}
          </button>
          {activeImageUrl !== imageUrl && (
            <button
              onClick={() => setActiveImageUrl(imageUrl)}
              className="px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs"
            >
              ↩ Оригинал
            </button>
          )}
          <div className="flex gap-1 ml-auto">
            {TEMPLATE_LABELS.map(([t, label, cls]) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${cls} ${template === t ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-90'}`}
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

        <div className="border border-zinc-700 rounded-xl overflow-hidden bg-zinc-900" style={{ lineHeight: 0 }}>
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
          <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-0.5">Заголовок</div>
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
