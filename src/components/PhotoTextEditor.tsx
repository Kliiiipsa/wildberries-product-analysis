'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface TextBlock {
  id: string;
  type: 'headline' | 'badge' | 'feature' | 'promo' | 'context';
  title: string;
  subtitle: string | null;
  position: string;
  style: 'dark' | 'light' | 'accent';
  // Runtime position (as fraction 0-1 of canvas size)
  x: number;
  y: number;
  visible: boolean;
}

interface PhotoTextEditorProps {
  imageUrl: string;
  analysis?: {
    good?: string[];
    improve?: string[];
  } | null;
  onExport?: (dataUrl: string) => void;
}

const STYLE_COLORS = {
  dark: { bg: 'rgba(0,0,0,0.75)', text: '#ffffff', sub: 'rgba(255,255,255,0.85)', border: 'rgba(255,255,255,0.2)' },
  light: { bg: 'rgba(255,255,255,0.88)', text: '#1a1a1a', sub: 'rgba(0,0,0,0.65)', border: 'rgba(0,0,0,0.12)' },
  accent: { bg: 'rgba(220,38,38,0.92)', text: '#ffffff', sub: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.3)' },
};

// Spread blocks vertically so they don't overlap when multiple share the same row
const POSITION_TO_XY: Record<string, [number, number]> = {
  'top': [0.5, 0.07],
  'bottom': [0.5, 0.87],
  'top-left': [0.15, 0.1],
  'top-right': [0.85, 0.1],
  'bottom-left': [0.15, 0.76],
  'bottom-right': [0.85, 0.76],
  'center': [0.5, 0.5],
};

// Strip emoji and other non-BMP characters that canvas fonts can't render reliably
function stripEmoji(str: string): string {
  return str
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export default function PhotoTextEditor({ imageUrl, analysis, onExport }: PhotoTextEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 800 });

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const cw = canvas.width;
    const ch = canvas.height;

    for (const block of blocks) {
      if (!block.visible) continue;

      const cx = block.x * cw;
      const cy = block.y * ch;
      const colors = STYLE_COLORS[block.style];
      const isSelected = block.id === selected;

      const maxW = cw * 0.44;
      const pad = 12;
      const radius = block.type === 'badge' ? 28 : 8;

      // Measure text
      const titleSize = block.type === 'badge' ? 22 : block.type === 'headline' ? 28 : 20;
      const subSize = 14;
      ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
      const titleLines = wrapText(ctx, stripEmoji(block.title), maxW - pad * 2);
      const titleH = titleLines.length * (titleSize + 4);

      ctx.font = `400 ${subSize}px Inter, system-ui, sans-serif`;
      const subLines = block.subtitle ? wrapText(ctx, stripEmoji(block.subtitle), maxW - pad * 2) : [];
      const subH = subLines.length * (subSize + 3);

      const boxW = Math.min(maxW, Math.max(
        ...titleLines.map(l => { ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`; return ctx.measureText(l).width; }),
        ...subLines.map(l => { ctx.font = `400 ${subSize}px Inter, system-ui, sans-serif`; return ctx.measureText(l).width; }),
      ) + pad * 2);
      const boxH = titleH + (subH ? subH + 6 : 0) + pad * 2;

      // Center the box on cx/cy
      const bx = Math.max(4, Math.min(cw - boxW - 4, cx - boxW / 2));
      const by = Math.max(4, Math.min(ch - boxH - 4, cy - boxH / 2));

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;

      // Background rounded rect
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, radius);
      ctx.fillStyle = colors.bg;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Border
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, radius);
      ctx.strokeStyle = isSelected ? '#3b82f6' : colors.border;
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.stroke();

      // Title text
      ctx.fillStyle = colors.text;
      ctx.textBaseline = 'top';
      let ty = by + pad;
      ctx.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
      for (const line of titleLines) {
        ctx.fillText(line, bx + pad, ty);
        ty += titleSize + 4;
      }

      // Subtitle
      if (subLines.length > 0) {
        ty += 4;
        ctx.font = `400 ${subSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = colors.sub;
        for (const line of subLines) {
          ctx.fillText(line, bx + pad, ty);
          ty += subSize + 3;
        }
      }

      // Selection handles
      if (isSelected) {
        ctx.fillStyle = '#3b82f6';
        const handles = [[bx, by], [bx + boxW, by], [bx, by + boxH], [bx + boxW, by + boxH]];
        for (const [hx, hy] of handles) {
          ctx.beginPath();
          ctx.arc(hx, hy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [blocks, selected]);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      // Scale to fit 600px wide
      const maxW = 600;
      const scale = maxW / img.naturalWidth;
      const h = Math.round(img.naturalHeight * scale);
      setCanvasSize({ w: maxW, h });
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl, draw]);

  // Redraw when blocks/selection change
  useEffect(() => {
    draw();
  }, [draw]);

  // Load AI text suggestions
  const loadAISuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/photo/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (data.blocks) {
        const newBlocks: TextBlock[] = data.blocks.map((b: Omit<TextBlock, 'x' | 'y' | 'visible'>) => {
          const [x, y] = POSITION_TO_XY[b.position] ?? [0.5, 0.5];
          return { ...b, x, y, visible: true };
        });
        setBlocks(newBlocks);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [analysis]);

  // Canvas mouse events for dragging blocks
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const hitTest = (px: number, py: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cw = canvas.width;
    const ch = canvas.height;
    // Test in reverse order (topmost first)
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (!b.visible) continue;
      const cx = b.x * cw;
      const cy = b.y * ch;
      // Approximate hit area: 200x80 centered
      if (px >= cx - 110 && px <= cx + 110 && py >= cy - 50 && py <= cy + 50) {
        return b.id;
      }
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(x, y);
    setSelected(hit);
    if (hit) {
      const b = blocks.find(b => b.id === hit)!;
      setDragging({ id: hit, startX: x, startY: y, origX: b.x, origY: b.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPos(e);
    const dx = (x - dragging.startX) / canvas.width;
    const dy = (y - dragging.startY) / canvas.height;
    setBlocks(prev => prev.map(b =>
      b.id === dragging.id
        ? { ...b, x: Math.max(0.05, Math.min(0.95, dragging.origX + dx)), y: Math.max(0.05, Math.min(0.95, dragging.origY + dy)) }
        : b
    ));
  };

  const onMouseUp = () => setDragging(null);

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onExport?.(dataUrl);
    // Also trigger download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'wb-photo-text.jpg';
    a.click();
  };

  const updateBlock = (id: string, changes: Partial<TextBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...changes } : b));
  };

  const addBlock = () => {
    const newBlock: TextBlock = {
      id: `block_${Date.now()}`,
      type: 'headline',
      title: 'Новый текст',
      subtitle: null,
      position: 'center',
      style: 'dark',
      x: 0.5,
      y: 0.5,
      visible: true,
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelected(newBlock.id);
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selected === id) setSelected(null);
  };

  const selectedBlock = blocks.find(b => b.id === selected) ?? null;

  return (
    <div className="flex gap-4 h-full">
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={loadAISuggestions}
            disabled={loading}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <><span className="animate-spin">⏳</span> Генерирую тексты...</>
            ) : (
              '✨ Сгенерировать тексты'
            )}
          </button>
          <button
            onClick={addBlock}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
          >
            + Добавить блок
          </button>
          <button
            onClick={exportImage}
            disabled={blocks.filter(b => b.visible).length === 0}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 ml-auto"
          >
            ⬇ Скачать фото
          </button>
        </div>

        <div className="relative border border-zinc-700 rounded-xl overflow-hidden" style={{ lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="max-w-full cursor-crosshair select-none"
            style={{ display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          {blocks.filter(b => b.visible).length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 text-white/70 text-sm px-4 py-2 rounded-lg">
                Нажмите «Сгенерировать тексты» или добавьте блок вручную
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-64 flex flex-col gap-3 shrink-0">
        {/* Block list */}
        <div className="bg-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-400 font-medium mb-2 uppercase tracking-wide">Блоки</div>
          {blocks.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-2">Нет блоков</div>
          ) : (
            <div className="flex flex-col gap-1">
              {blocks.map(b => (
                <div
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                    selected === b.id ? 'bg-violet-600/30 text-violet-300' : 'hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); updateBlock(b.id, { visible: !b.visible }); }}
                    className="text-zinc-400 hover:text-white text-xs shrink-0"
                    title={b.visible ? 'Скрыть' : 'Показать'}
                  >
                    {b.visible ? '👁' : '🙈'}
                  </button>
                  <span className="flex-1 truncate">{b.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }}
                    className="text-zinc-500 hover:text-red-400 text-xs shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit selected block */}
        {selectedBlock && (
          <div className="bg-zinc-800 rounded-xl p-3 flex flex-col gap-3">
            <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Редактировать</div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Заголовок</label>
              <input
                type="text"
                value={selectedBlock.title}
                onChange={e => updateBlock(selectedBlock.id, { title: e.target.value })}
                className="w-full bg-zinc-700 text-white text-sm px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Подзаголовок</label>
              <input
                type="text"
                value={selectedBlock.subtitle ?? ''}
                onChange={e => updateBlock(selectedBlock.id, { subtitle: e.target.value || null })}
                placeholder="необязательно"
                className="w-full bg-zinc-700 text-white text-sm px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Стиль</label>
              <div className="flex gap-2">
                {(['dark', 'light', 'accent'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => updateBlock(selectedBlock.id, { style: s })}
                    className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                      selectedBlock.style === s ? 'ring-2 ring-violet-500' : ''
                    } ${
                      s === 'dark' ? 'bg-zinc-900 text-white' :
                      s === 'light' ? 'bg-white text-zinc-900' :
                      'bg-red-600 text-white'
                    }`}
                  >
                    {s === 'dark' ? 'Тёмный' : s === 'light' ? 'Светлый' : 'Акцент'}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Перетащите блок мышью прямо на фото
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="bg-zinc-800/50 rounded-xl p-3 text-xs text-zinc-500 leading-relaxed">
          <div className="text-zinc-400 font-medium mb-1">Как использовать</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>Кликните по блоку чтобы выбрать</li>
            <li>Тащите блок по фото для позиции</li>
            <li>Редактируйте текст в панели</li>
            <li>Скачайте готовое фото</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
