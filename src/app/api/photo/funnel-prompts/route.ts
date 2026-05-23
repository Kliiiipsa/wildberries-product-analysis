import { NextRequest } from 'next/server';

export const maxDuration = 30;

const FUNNEL_PROMPT = `You are a professional WB Wildberries product photography strategist.

You receive a base photography prompt (with [PRESERVE] section containing all product details) and must generate EXACTLY 4 optimized funnel photography prompts, one per concept below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 FUNNEL CONCEPTS (generate in this exact order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHOTO 1 — STUDIO HERO:
Goal: Highest CTR in 130×130px thumbnail. Item clearly visible, maximum contrast.
- Full-height model, product fills 70-80% of frame
- Clean neutral studio background — MAXIMUM CONTRAST to the item color
  (light item → dark charcoal/slate background | dark item → white/cream background | bright color → soft grey)
- Natural confident pose, slight 3/4 angle to camera
- Sharp studio lighting, no distracting shadows

PHOTO 2 — DETAIL CLOSE-UP:
Goal: Show quality, win doubters who want to see material/stitching.
- EXTREME close-up of the product's strongest visual detail (fabric weave, lace edge, stitching quality, waistband, pocket edge, logo/branding)
- If possible: model's hands in frame demonstrating the material (slight stretch, showing drape)
- Soft diffused studio light emphasizing texture
- Simple clean background, maximum contrast to the detail

PHOTO 3 — LIFESTYLE IN MOTION:
Goal: Emotional connection, show the product "living" on a person.
- Model in NATURAL MOVEMENT — mid-stride walking, sitting down, turning, reaching
- Real lifestyle setting matching the product type (café, cobblestone street, park, rooftop)
- Authentic atmosphere, NOT a posed studio shot
- Golden hour OR soft overcast light, warm and cinematic feel

PHOTO 4 — SILHOUETTE & FIT:
Goal: Show cut, drape, and how it actually fits — answers the "will this look good on me?" doubt.
- Back view OR side 3/4 view revealing full silhouette
- OR: back detail / print / unique back feature
- Clean studio background (matching Photo 1) for consistency in the WB card
- Lighting emphasizes the shape and drape of the fabric

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT FORMAT — MANDATORY FOR ALL 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the [PRESERVE] section from the base prompt (copy it exactly — do NOT change product details).
Then write [CHANGE], [SCENE], [QUALITY] specific to each concept.

[PRESERVE] Keep unchanged: [copy all clothing details from input]. [Same body/no-face rules from input.]
[CHANGE] Change only: [exactly what changes — background, pose, crop, lighting setup]
[SCENE] [Very specific: background color/texture, light direction, time of day if lifestyle, atmosphere]
[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, natural skin tones, no AI artifacts.

Return ONLY valid JSON (no markdown):
{
  "funnelPhotos": [
    {
      "title": "Главное фото",
      "description": "описание на русском — что показывает фото и почему оно продаёт (1-2 предложения)",
      "concept": "studio",
      "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."
    },
    {
      "title": "Детали и качество",
      "description": "...",
      "concept": "closeup",
      "promptEn": "..."
    },
    {
      "title": "Лайфстайл",
      "description": "...",
      "concept": "lifestyle",
      "promptEn": "..."
    },
    {
      "title": "Посадка и силуэт",
      "description": "...",
      "concept": "silhouette",
      "promptEn": "..."
    }
  ]
}`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const generatePrompt: string = body?.generatePrompt ?? '';
  const analysisText: string = body?.analysisText ?? '';

  if (!generatePrompt) {
    return Response.json({ error: 'generatePrompt обязателен — сначала проанализируйте фото' }, { status: 400 });
  }

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });

  const userMessage = `Base prompt (contains all product details in [PRESERVE]):
${generatePrompt}

${analysisText ? `Additional product context:\n${analysisText}` : ''}

Generate 4 funnel photography prompts following the concepts above.`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 28_000);

  try {
    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `gpt://${folderId}/yandexgpt/latest`,
        messages: [
          { role: 'system', content: FUNNEL_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const t = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${t}` }, { status: 500 });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) return Response.json({ error: 'Пустой ответ' }, { status: 500 });

    try {
      const s = content.indexOf('{');
      const e = content.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('no JSON');
      return Response.json(JSON.parse(content.slice(s, e + 1)));
    } catch {
      return Response.json({ error: `JSON parse error: ${content.slice(0, 200)}` }, { status: 500 });
    }
  } catch (err) {
    clearTimeout(timer);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
