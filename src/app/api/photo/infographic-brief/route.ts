import { NextRequest } from 'next/server';
import { buildQwenBriefPrompt }       from '@/lib/photo/prompt-builder';
import { parseQwenBriefResponse }      from '@/lib/photo/prompt-builder';
import { buildFluxBasePrompt }         from '@/lib/photo/prompt-builder';
import { buildInfographicBriefFromInput } from '@/lib/photo/brief-builder';
import { selectInfographicTemplate, validateInfographicBrief } from '@/lib/photo/infographic-templates';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ ok: false, error: 'Невалидный JSON в теле запроса' }, { status: 400 });
  }

  const {
    productType,
    category,
    title,
    description,
    characteristics,
    benefits,
    photoGoal,
    targetAudience,
    style,
  } = body as Record<string, unknown>;

  // ── 1. Build Qwen prompt ───────────────────────────────────────────────────
  const qwenPrompt = buildQwenBriefPrompt({
    productName: typeof title       === 'string' ? title       : undefined,
    productType: typeof productType === 'string' ? productType : undefined,
    category:    typeof category    === 'string' ? category    : undefined,
    description: [
      typeof description === 'string' ? description : '',
      Array.isArray(characteristics)  ? `Характеристики: ${(characteristics as string[]).join(', ')}` : '',
      Array.isArray(benefits)         ? `Преимущества: ${(benefits as string[]).join(', ')}`          : '',
      typeof targetAudience === 'string' ? `ЦА: ${targetAudience}` : '',
      typeof style === 'string'          ? `Стиль: ${style}`       : '',
    ].filter(Boolean).join('\n') || undefined,
  });

  // ── 2. Call Yandex API (text-only Qwen) ───────────────────────────────────
  const apiKey  = (process.env.YANDEX_API_KEY    ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) {
    return Response.json({ ok: false, error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  }

  const warnings: string[] = [];
  let rawQwenResponse: string | null = null;
  let source: 'qwen' | 'fallback' = 'fallback';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);

  try {
    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `gpt://${folderId}/qwen3.6-35b-a3b/latest`,
        messages: [
          { role: 'system', content: '/nothink' },
          { role: 'user',   content: qwenPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      const msg = data?.choices?.[0]?.message;
      rawQwenResponse = msg?.content ?? msg?.reasoning_content ?? null;
    } else {
      const errText = await resp.text().catch(() => resp.statusText);
      warnings.push(`Qwen API ${resp.status}: ${errText.slice(0, 200)}`);
    }
  } catch (e) {
    clearTimeout(timer);
    warnings.push(`Qwen API error: ${String(e).slice(0, 200)}`);
  }

  // ── 3. Parse Qwen response ─────────────────────────────────────────────────
  let brief = rawQwenResponse ? parseQwenBriefResponse(rawQwenResponse) : null;

  if (brief) {
    source = 'qwen';
  } else {
    // ── 4. Fallback: build brief from raw input ──────────────────────────────
    if (rawQwenResponse) {
      warnings.push('Qwen вернул невалидный JSON — использован fallback из входных данных');
    }
    brief = buildInfographicBriefFromInput({
      productType: typeof productType === 'string' ? productType : undefined,
      category:    typeof category    === 'string' ? category    : undefined,
      photoGoal:   typeof photoGoal   === 'string' ? photoGoal   : undefined,
      benefits:    Array.isArray(benefits) ? benefits : (typeof benefits === 'string' ? benefits : undefined),
    });
    source = 'fallback';
  }

  // Collect validation warnings (non-blocking)
  const validation = validateInfographicBrief(brief);
  if (!validation.valid) {
    warnings.push(...validation.errors.map(e => `brief: ${e}`));
  }
  warnings.push(...validation.warnings);

  // ── 5. Select template ─────────────────────────────────────────────────────
  const template = selectInfographicTemplate(brief);

  // ── 6. Build Flux prompt ───────────────────────────────────────────────────
  const fluxPrompt = buildFluxBasePrompt(brief, template);

  // ── 7. Return result ───────────────────────────────────────────────────────
  return Response.json({
    ok:         true,
    brief,
    template,
    fluxPrompt,
    source,
    warnings,
  });
}
