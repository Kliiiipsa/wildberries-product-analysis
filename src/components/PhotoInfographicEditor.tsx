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
  overlayBg: string; textColor: string; subtitleColor: string;
  accentColor: string; circleStroke: string; tagBg: string;
  tagText: string; bottomBg: string;
}> = {
  light: {
    overlayBg: 'rgba(252,249,244,0.96)', textColor: '#1a1a1a',
    subtitleColor: 'rgba(30,30,30,0.5)', accentColor: '#7a5c2a',
    circleStroke: '#c49a3c', tagBg: 'rgba(122,92,42,0.12)',
    tagText: '#7a5c2a', bottomBg: 'rgba(122,92,42,0.06)',
  },
  dark: {
    overlayBg: 'rgba(10,10,12,0.93)', textColor: '#f0ede8',
    subtitleColor: 'rgba(240,237,232,0.5)', accentColor: '#c9a96e',
    circleStroke: '#c9a96e', tagBg: 'rgba(201,169,110,0.15)',
    tagText: '#c9a96e', bottomBg: 'rgba(201,169,110,0.06)',
  },
  beige: {
    overlayBg: 'rgba(240,232,218,0.97)', textColor: '#2c1f0e',
    subtitleColor: 'rgba(44,31,14,0.45)', accentColor: '#8b5e30',
    circleStroke: '#a0723e', tagBg: 'rgba(139,94,48,0.12)',
    tagText: '#8b5e30', bottomBg: 'rgba(139,94,48,0.07)',
  },
  black: {
    overlayBg: 'rgba(0,0,0,0.97)', textColor: '#ffffff',
    subtitleColor: 'rgba(255,255,255,0.45)', accentColor: '#e0c97a',
    circleStroke: '#e0c97a', tagBg: 'rgba(224,201,122,0.14)',
    tagText: '#e0c97a', bottomBg: 'rgba(224,201,122,0.07)',
  },
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

  ctx.drawImage(img, 0, 0, w, h);

  ctx.fillStyle = t.overlayBg;
  ctx.fillRect(0, 0, panelW, h);

  const grad = ctx.createLinearGradient(panelW - fadeW, 0, panelW, 0);
  grad.addColorStop(0, t.overlayBg);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(panelW - fadeW, 0, fadeW, h);

  ctx.fillStyle = t.accentColor;
  ctx.fillRect(0, 0, stripeW, h);

  // Dot grid
  const dotStep = Math.round(w * 0.022);
  const dotArea = Math.round(w * 0.10);
  for (let dx = 0; dx <= dotArea; dx += dotStep) {
    for (let dy = 0; dy <= dotArea; dy += dotStep) {
      ctx.beginPath();
      ctx.arc(panelW - fadeW - 4 - (dotArea - dx), Math.round(h * 0.032) + dy, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = t.circleStroke;
      ctx.globalAlpha = 0.18;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  let y = Math.round(h * 0.058);

  // Tagline pill
  const tagSize = Math.round(h * 0.017);
  ctx.font = `600 ${tagSize}px Arial, Helvetica, sans-serif`;
  const tagText = data.tagline.toUpperCase();
  const tagTextW = ctx.measureText(tagText).width;
  const tagPadH = Math.round(tagSize * 0.5);
  const tagPadV = Math.round(tagSize * 0.35);
  const tagW = tagTextW + tagPadH * 2;
  const tagH = tagSize + tagPadV * 2;
  const tagR = tagH / 2;

  roundRect(ctx, pad, y, tagW, tagH, tagR);
  ctx.fillStyle = t.tagBg;
  ctx.fill();
  roundRect(ctx, pad, y, tagW, tagH, tagR);
  ctx.strokeStyle = t.accentColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = t.tagText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, pad + tagPadH, y + tagH / 2);
  ctx.textBaseline = 'top';
  y += tagH + Math.round(h * 0.02);

  // Product name
  const nameSize = Math.round(h * 0.074);
  ctx.font = `900 ${nameSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.textColor;
  ctx.textAlign = 'left';
  const nameLines = wrapText(ctx, data.productName.toUpperCase(), maxTextW);
  for (const line of nameLines) {
    ctx.fillText(line, pad, y);
    y += Math.round(nameSize * 1.06);
  }

  // Subtitle
  const subSize = Math.round(h * 0.022);
  ctx.font = `italic ${subSize}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.fillText(data.productSubtitle, pad, y);
  y += subSize + Math.round(h * 0.022);

  // Divider with diamond
  const lineY = y + 2;
  const lineX1 = pad;
  const lineX2 = panelW - pad - fadeW;
  const midX = (lineX1 + lineX2) / 2;
  const dSize = 4;

  ctx.beginPath(); ctx.moveTo(lineX1, lineY); ctx.lineTo(midX - dSize * 1.6, lineY);
  ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1; ctx.globalAlpha = 0.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(midX + dSize * 1.6, lineY); ctx.lineTo(lineX2, lineY); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(midX, lineY - dSize); ctx.lineTo(midX + dSize, lineY);
  ctx.lineTo(midX, lineY + dSize); ctx.lineTo(midX - dSize, lineY);
  ctx.closePath(); ctx.fillStyle = t.circleStroke; ctx.fill();
  y += Math.round(h * 0.036);

  // Section label
  const sectionLabelSize = Math.round(h * 0.014);
  ctx.font = `600 ${sectionLabelSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = t.subtitleColor;
  ctx.textBaseline = 'top';
  ctx.fillText('ХАРАКТЕРИСТИКИ', pad, y);
  y += sectionLabelSize + Math.round(h * 0.016);

  // Characteristics
  const chars = data.characteristics.slice(0, 3);
  const charTitleSize = Math.round(h * 0.019);
  const charValSize = Math.round(h * 0.015);
  const badgeSize = Math.round(h * 0.036);
  const charSpacing = Math.round(h * 0.118);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    roundRect(ctx, pad, y, badgeSize, badgeSize, 5);
    ctx.fillStyle = t.tagBg; ctx.fill();
    roundRect(ctx, pad, y, badgeSize, badgeSize, 5);
    ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.font = `bold ${Math.round(badgeSize * 0.52)}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.accentColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), pad + badgeSize / 2, y + badgeSize / 2 + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const tx = pad + badgeSize + Math.round(w * 0.018);
    const tMaxW = maxTextW - badgeSize - Math.round(w * 0.02);
    const titleY = y + (badgeSize - charTitleSize) / 2 - 1;

    ctx.font = `700 ${charTitleSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = t.textColor;
    ctx.fillText(ch.title.toUpperCase(), tx, titleY);

    if (ch.value) {
      ctx.font = `${charValSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = t.subtitleColor;
      const valLines = wrapText(ctx, ch.value, tMaxW);
      let vy = titleY + charTitleSize + 3;
      for (const vl of valLines) { ctx.fillText(vl, tx, vy); vy += charValSize + 2; }
    }
    y += charSpacing;
  }

  // Bottom section
  const bottomH = Math.round(h * 0.09);
  const bottomY = h - bottomH;
  ctx.fillStyle = t.bottomBg;
  ctx.fillRect(0, bottomY, panelW, bottomH);

  ctx.beginPath(); ctx.moveTo(pad, bottomY + 8); ctx.lineTo(panelW - pad - fadeW, bottomY + 8);
  ctx.strokeStyle = t.circleStroke; ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke();
  ctx.globalAlpha = 1;

  if (data.bottomText) {
    const btSize = Math.round(h * 0.017);
    ctx.font = `italic ${btSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = t.subtitleColor;
    ctx.textBaseline = 'middle';
    const btLines = wrapText(ctx, data.bottomText, maxTextW);
    const totalBtH = btLines.length * (btSize + 4);
    let by = bottomY + (bottomH - totalBtH) / 2 + 4;
    for (const bl of btLines) { ctx.fillText(bl, pad, by); by += btSize + 4; }
    ctx.textBaseline = 'top';
  }
}

export default function PhotoInfographicEditor({ imageUrl, analysis, generatePrompt, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [template, setTemplate] = useState<TemplateStyle>('light');
  const [loadingText, setLoadingText] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState('');
  const [genStep, setGenStep] = useState('');

  // ── Load AI text content ─────────────────────────────────────────────────────
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

  // ── Convert any URL to data URL (avoids CORS/canvas taint issues) ────────────
  const toDataUrl = async (url: string): Promise<string> => {
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
  };

  // ── Render infographic onto a loaded image and return data URL ───────────────
  // imgSrc MUST be a data URL (same-origin) — external URLs taint the canvas
  const renderOnImage = useCallback((imgSrc: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) { reject(new Error('no canvas')); return; }
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        drawInfographic(ctx, img, canvas.width, canvas.height, data, template);
        resolve(canvas.toDataURL('image/jpeg', 0.96));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = imgSrc;
    });
  }, [data, template]);

  // ── Main: Generate infographic ───────────────────────────────────────────────
  // Step 1: FLUX repositions product (right side, left side clean for text)
  // Step 2: Canvas draws infographic overlay on FLUX result
  const handleGenerate = async () => {
    if (!imageUrl) return;
    setGenerating(true);
    setResultUrl(null);
    setGenError('');

    try {
      // Build FLUX prompt for optimal infographic composition
      const preserveSection = generatePrompt
        ? generatePrompt.split(/\[CHANGE\]|\[SCENE\]|\[QUALITY\]/)[0] ?? ''
        : '';

      const fluxPrompt = `${preserveSection.trim()} [CHANGE] Change only: recompose for a WB marketplace product card — position the product/model to the RIGHT half of the frame, the LEFT 45% of the frame must be clean background with no model, no objects, no elements. [SCENE] Clean smooth studio background filling the left half of the frame (soft white-to-light-grey gradient), product on the right side sharp and well-lit, soft wrap lighting from the upper left. Commercial e-commerce product photography composition, WB Premium Card Style. [QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural studio light, no AI artifacts, real film grain.`;

      setGenStep('FLUX обрабатывает фото (~30 сек)...');
      const fluxRes = await fetch('/api/photo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt: fluxPrompt }),
      });
      const fluxData = await fluxRes.json();
      if (!fluxRes.ok || !fluxData.imageUrl) {
        throw new Error(fluxData.error || 'FLUX не вернул изображение');
      }

      setGenStep('Накладываю инфографику...');
      const fluxDataUrl = await toDataUrl(fluxData.imageUrl);
      const final = await renderOnImage(fluxDataUrl);
      setResultUrl(final);
      onExport?.(final);
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
      setGenStep('');
    }
  };

  // ── Quick preview: render overlay on original photo (no FLUX) ────────────────
  const handlePreview = async () => {
    setGenerating(true);
    setResultUrl(null);
    setGenError('');
    setGenStep('Генерирую превью...');
    try {
      const srcDataUrl = await toDataUrl(imageUrl);
      const final = await renderOnImage(srcDataUrl);
      setResultUrl(final);
      onExport?.(final);
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
      setGenStep('');
    }
  };

  const downloadResult = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'infographic.jpg';
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
      {/* Hidden canvas — only used for rendering, never shown directly */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Two-column layout: form on right, result on left */}
      <div className="flex gap-4">

        {/* Result area */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden max-h-[460px] min-h-[220px] relative flex items-center justify-center">
            {generating ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">{genStep || 'Генерирую...'}</p>
                <p className="text-xs text-slate-500 mt-1">Подождите, это займёт ~30–60 сек</p>
              </div>
            ) : resultUrl ? (
              <>
                <img src={resultUrl} alt="Инфографика" className="w-full h-full object-contain" />
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
                <p className="text-xs mt-1 text-zinc-600">и нажмите «Создать инфографику»</p>
              </div>
            )}
          </div>

          {genError && (
            <div className="mt-2 rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">
              {genError}
            </div>
          )}

          {/* Generate buttons */}
          {!resultUrl && !generating && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={!imageUrl}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                ✨ Создать инфографику (FLUX + текст)
              </button>
              <button
                onClick={handlePreview}
                disabled={!imageUrl}
                className="px-3 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl text-sm disabled:opacity-50"
                title="Быстрый превью без FLUX — текст сразу на оригинальном фото"
              >
                Превью
              </button>
            </div>
          )}

          {/* Theme selector */}
          <div className="mt-3 flex gap-1 flex-wrap">
            {TEMPLATE_LABELS.map(([t, label, cls]) => (
              <button
                key={t}
                onClick={() => { setTemplate(t); if (resultUrl) setResultUrl(null); }}
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

          <div className="bg-zinc-800/50 rounded-xl p-3 text-xs text-zinc-500 leading-relaxed">
            <p className="font-medium text-zinc-400 mb-1">Как работает</p>
            <p>1. Заполните текст (или нажмите ✨ AI)</p>
            <p className="mt-0.5">2. «Создать инфографику» — FLUX улучшит композицию фото, затем добавится текст</p>
            <p className="mt-0.5">3. «Превью» — быстро, без FLUX</p>
          </div>
        </div>
      </div>
    </div>
  );
}
