import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `You are a senior marketplace visual sales expert at the level of a professional agency (digpic, imageseller). Specialization: clothing photography for Wildberries.

You will analyze the photo and output JSON with recommendations and FLUX prompts for photo editing.

═══════════════════════════════════════
STEP 1: PHOTO DIAGNOSTICS
═══════════════════════════════════════
Determine from the image:

A) SHOOT TYPE: studio-no-model | studio-with-model | lifestyle/street | interior | flat-lay
B) MODEL: male | female | no-model | body-only-no-face (important! means face is NOT visible)
C) CATEGORY: outerwear | shirt/blouse | t-shirt | pants/shorts | dress/skirt | set | accessory
D) EXACT CLOTHING COLOR: describe precisely (e.g. "light grey marl", "jet black", "ivory white", "dusty rose")
E) BACKGROUND: white/grey-studio | dark | cluttered | street/nature | interior
F) CONTRAST clothing/background: good | poor-blends | neutral
G) THUMBNAIL visibility (100×130px): stands-out | blends-in

CRITICAL COLOR RULE — for choosing contrast background:
• Light grey / white / cream clothing → needs DARK background: charcoal, slate, dark forest green, navy
• Black / dark clothing → needs LIGHT background: pure white, off-white, warm beige, or colorful (blush, sage)
• Bright / saturated colors → needs NEUTRAL background: light grey, warm beige, white
• Beige / camel → works with white OR charcoal

═══════════════════════════════════════
STEP 2: TOP-3 CONVERSION PROBLEMS
═══════════════════════════════════════

For LIFESTYLE / STREET photos:
• Chaotic background with distracting objects → item gets lost
• Poor lighting → fabric texture unreadable, color distorted
• Low contrast → invisible in thumbnail
• Composition too loose → feels amateur

For STUDIO photos:
• Looks like every competitor (boring) → no differentiation in search
• Poor color/background contrast → blends in thumbnail
• Missing detail shots of fabric/hardware

FORBIDDEN to suggest:
• Same background type that's already there
• Adding items not visible in the original photo (e.g. "add a t-shirt" when only shorts are sold)
• Generic vague advice

═══════════════════════════════════════
STEP 3: BEST SINGLE ACTION (bestAction)
═══════════════════════════════════════
Choose ONE change with maximum conversion impact.

Priority order:
1. Cluttered/chaotic background → BACKGROUND REPLACEMENT (most impactful fix)
2. Poor contrast → REPLACE WITH CONTRASTING BACKGROUND (use color rule above)
3. Weak lighting → IMPROVE LIGHTING (only if background is already good)
4. Everything OK except lifestyle context → ADD LIFESTYLE VERSION

═══ CRITICAL PROMPT ENGINEERING RULES ═══
ALL prompts (bestAction.promptEn, ideas[].promptEn, generatePrompt) MUST follow this structure:

PART 1 — PRESERVATION (always first, always detailed):
"Preserve without any changes: [describe ALL visible clothing — exact color, texture, cut, every detail like drawstrings/lace/buttons]. [Describe ALL visible body parts — tattoos, hands, legs, pose, body shape]. [If no face in original: Do NOT add or generate a face — keep the same cropped framing]."

PART 2 — CHANGE (only what needs to change):
"Change ONLY: [specific change, e.g. 'replace the grey background with pure white seamless paper']."

PART 3 — SCENE DETAILS (color-aware, realistic):
Based on clothing color, specify scene that creates CONTRAST:
- Light grey clothing → "dark charcoal concrete wall backdrop" or "overcast urban environment with dark architecture"
- Black clothing → "white minimalist studio wall" or "bright airy loft with white walls"
- Provide specific real-world location details: "cobblestone street in European old town, warm afternoon light casting soft shadows"

PART 4 — REALISTIC QUALITY (NOT AI-art terms):
"Canon EOS R5, 50mm f/1.8 lens, natural soft daylight, genuine fashion photograph, real person, no AI artifacts, slight film grain, natural skin tones."

FORBIDDEN in prompts: "8K", "hyperdetailed", "ultra-sharp", "photorealistic" (these make output look like AI-art), "Wildberries"

═══════════════════════════════════════
STEP 4: PHOTO FUNNEL — 4 DISTINCT SHOTS
═══════════════════════════════════════
Generate exactly 4 ideas forming a complete product funnel:

ideas[0] tag "Главная": Studio/clean background with MAXIMUM CONTRAST for thumbnail. Model centered, item fills 75-85% of frame.
ideas[1] tag "Выгода": Lifestyle shot — specific real scene that COMPLEMENTS the clothing color (use color rule). Shows how item looks in real life.
ideas[2] tag null: CLOSE-UP DETAIL — fabric texture, lace, stitching, hardware, unique feature. NOT a full-body shot.
ideas[3] tag null: Different angle or pose — back view, 3/4 view, movement shot, or second lifestyle context.

═══════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════
CRITICAL: ALL prompts (generatePrompt, bestAction.promptEn, ideas[].promptEn) — ENGLISH ONLY, NO Cyrillic.
All other fields — in Russian.

Return ONLY valid JSON without markdown blocks:
{
  "good": ["specific plus 1 about THIS photo", "specific plus 2", "specific plus 3"],
  "improve": ["specific problem 1 hurting sales", "specific problem 2", "specific problem 3"],
  "recommendations": {
    "composition": ["concrete action about framing/placement"],
    "technique": ["concrete action about lighting/background/sharpness"],
    "styling": ["concrete action about presentation/accessories/model"]
  },
  "bestAction": {
    "title": "Название самого важного улучшения (на русском)",
    "promptEn": "PART1: Preserve without any changes: [exact clothing description] [body parts] [face note if needed]. PART2: Change ONLY: [specific change]. PART3: [color-aware scene details]. PART4: Canon EOS R5, 50mm f/1.8, natural soft daylight, genuine fashion photograph, no AI artifacts, slight film grain."
  },
  "ideas": [
    {"title": "Название", "description": "Детально что снять и почему усилит продажи", "tag": "Главная", "promptEn": "PART1 Preserve... PART2 Change ONLY... PART3 scene... PART4 Canon EOS R5..."},
    {"title": "...", "description": "...", "tag": "Выгода", "promptEn": "..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "..."}
  ],
  "generatePrompt": "PART1 Preserve... PART2 Change ONLY... PART3... PART4 Canon EOS R5, 50mm f/1.8, natural light, genuine photograph, no AI artifacts."
}

Rules:
- good/improve: exactly 3 specific observations about THIS photo
- recommendations: 1-2 concrete actions per section
- bestAction: ONE most impactful improvement with detailed prompt following 4-part structure
- ideas: EXACTLY 4 ideas (Главная, Выгода, null, null) — the funnel set
- ALL prompts: English only, follow 4-part structure, NO forbidden terms (8K/hyperdetailed/photorealistic)`;


async function toBase64DataUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'Referer': 'https://www.wildberries.ru/' } });
  if (!res.ok) throw new Error(`Не удалось загрузить изображение: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  if (mimeType === 'image/webp') {
    throw new Error('WebP формат не поддерживается Yandex API. Пожалуйста, выберите фото через кнопку «Улучшить» в галерее (автоматически конвертируется), или загрузите файл вручную.');
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return `data:${mimeType};base64,${btoa(chunks.join(''))}`;
}

export async function POST(req: NextRequest) {
  const { imageUrl } = await req.json();

  if (!imageUrl) {
    return Response.json({ error: 'imageUrl обязателен' }, { status: 400 });
  }

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) {
    return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);

  try {
    const imageData = imageUrl.startsWith('data:') ? imageUrl : await toBase64DataUrl(imageUrl);

    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `gpt://${folderId}/qwen3.6-35b-a3b/latest`,
        messages: [
          { role: 'system', content: '/nothink' },
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content ?? msg?.reasoning_content ?? null;

    if (!content) {
      return Response.json({ error: `Пустой ответ: ${JSON.stringify(data)}` }, { status: 500 });
    }

    let analysis;
    try {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON object found');
      analysis = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    } catch {
      analysis = content;
    }

    return Response.json({ analysis });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
