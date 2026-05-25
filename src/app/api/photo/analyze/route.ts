import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `You are a top-tier marketplace visual consultant (digpic agency level). Analyze this product photo for Wildberries and return structured JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — READ THE PHOTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Identify:
• MAIN PRODUCT: the primary clothing item being SOLD (e.g. shorts, dress, coat — NOT accessories or other visible clothes)
• GENDER: male model | female model | no model | cropped/no face
• EXACT PRODUCT COLOR: precise description (e.g. "light grey marl", "jet black", "ivory white", "dusty rose beige")
• SHOOT TYPE: studio-clean | studio-grey | lifestyle-urban | lifestyle-nature | interior | flat-lay
• BACKGROUND quality: clean | cluttered | low-contrast-with-item | good-contrast
• FACE VISIBLE: yes | no (cropped, body-only)

COLOR → CONTRAST BACKGROUND RULE (mandatory):
  light grey / white / cream item  →  dark backgrounds: charcoal wall, slate, dark brick, navy backdrop
  black / dark item                →  light backgrounds: pure white paper, off-white loft wall, warm ivory
  bright / vivid item              →  muted/neutral backgrounds: warm beige, light stone, soft grey
  beige / camel item               →  white OR dark charcoal

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — TOP-3 PROBLEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Focus ONLY on what hurts SALES of the MAIN PRODUCT:
• Low contrast between item color and background → invisible in 100×130px thumbnail
• Cluttered/distracting background → buyer attention goes to background, not item
• Item too small in frame → buyer cannot evaluate quality
• Missing texture/detail close-up → buyer cannot assess fabric quality
• Flat boring studio look identical to all competitors

NEVER suggest: changing model's styling choices (shirt/no-shirt is seller's decision), adding products not in the photo, vague generic advice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — BEST SINGLE ACTION (bestAction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONE change with maximum conversion impact. Priority:
1. Cluttered background → replace with clean contrasting backdrop
2. Low contrast → replace background using COLOR RULE above
3. Item too small → crop tighter, item fills 80% of frame
4. Generic studio → add lifestyle context matching the product

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — 6 FUNNEL IDEAS (smart lifestyle selection)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate EXACTLY 6 ideas. ideas[1], ideas[3], ideas[5] MUST be THREE DIFFERENT LIFESTYLE LOCATIONS chosen based on the product category and gender:

LIFESTYLE LOCATION GUIDE (choose from these, match to item):
  Men's shorts/sweatpants  →  [A] urban concrete plaza or skate park (midday hard light)  [B] sports park / outdoor basketball court (golden hour)  [C] rooftop terrace at dusk, warm string lights, dark city silhouette
  Men's jeans/pants        →  [A] city street with architecture (overcast soft light)  [B] cafe terrace or industrial loft (warm evening light)  [C] subway entrance or underground passage (cool blue shadows)
  Men's jacket/coat        →  [A] autumn park, fallen leaves, misty morning  [B] city metro entrance, evening blue hour  [C] modern glass office district, cold grey morning
  Women's dress/sundress   →  [A] café terrace with warm terracotta tones  [B] beach promenade or botanical garden (golden hour)  [C] cobblestone European street, summer afternoon, warm shadows
  Women's shorts/skirt     →  [A] cobblestone European street (summer afternoon)  [B] rooftop bar or vintage market  [C] park path lined with green trees, dappled light
  Women's blazer/coat      →  [A] modern glass office district  [B] evening city street with warm light pools  [C] library or gallery interior, natural window light
  Any dark item            →  prefer bright/light environments (white building walls, sandy beach, snow)
  Any light/grey item      →  prefer dark/contrasty environments (dark concrete, shadow areas, dark green trees)

ideas[0] tag "Главная":  studio shot, MAXIMUM thumbnail contrast (use color rule above — pick background that makes item pop in 130×130px thumbnail)
ideas[1] tag "Выгода":   FIRST lifestyle location (specific, from guide above)
ideas[2] tag null:       EXTREME CLOSE-UP of the most unique product detail (fabric texture / lace / stitching / logo / hardware)
ideas[3] tag null:       SECOND lifestyle location (DIFFERENT from ideas[1], from guide above)
ideas[4] tag null:       THIRD lifestyle location (DIFFERENT from ideas[1] and ideas[3], from guide above)
ideas[5] tag null:       ALTERNATIVE studio — flat-lay OR hanging shot OR detail mosaic (3 angles in one frame), contrasting surface

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT ENGINEERING — EXACT FORMAT REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every promptEn field MUST follow this EXACT 4-part structure:

[PRESERVE] Keep unchanged: [list every visible clothing detail — color/cut/fabric/drawstring/lace/buttons]. [List visible body: tattoos/hands/legs/pose]. [If no face in original photo: do NOT add or generate a face — maintain same cropped framing.]
[CHANGE] Change only: [exactly what to change, nothing else].
[SCENE] [Specific scene details matching category from guide — time of day, background color, light direction, atmosphere].
[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, natural skin tones, no AI artifacts.

EXAMPLE of a CORRECT prompt:
"[PRESERVE] Keep unchanged: light grey marl sweat shorts with drawstring waist, elastic waistband, side pockets, model's tattooed legs and hands, relaxed standing pose. No face in original — do NOT add or generate a face, keep same cropped framing. [CHANGE] Change only: replace the grey studio background. [SCENE] Urban concrete plaza at golden hour — dark charcoal pavement, warm orange sunlight from the right casting long shadows, blurred city buildings in the background providing dark contrast against the light grey shorts. [QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural golden-hour light, real film grain, no AI artifacts."

FORBIDDEN words in any prompt (these cause AI-art look): photorealistic, ultra-sharp, 8K, hyperdetailed, Sony A7R V, professional studio lighting, commercial fashion photography.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — PREMIUM INFOGRAPHIC BASE (fluxPrompt)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate a FLUX Kontext image-to-image prompt for a perfect Wildberries infographic base.

UNIVERSAL RULES (mandatory for ALL products):
• Composition: model in RIGHT 60-65% of frame, LEFT 35-40% is COMPLETELY CLEAN AND EMPTY — no body parts, no shadows, no props crossing into this zone
• Style: professional studio product photography, premium level — reference brands: Zara, Massimo Dutti, COS, Arket
• Lighting: soft diffused studio light from front-left, beautiful fabric shadows, high fabric texture detail
• Background: ONE SOLID COLOUR wall or seamless paper — no gradients, no vignettes, no patterns, no studio equipment, no reflections. The background colour MUST contrast the garment using the rule below.
• Format: vertical 3:4 ratio
• FORBIDDEN in [CHANGE]: selfie poses, phone in hands, bright distracting accessories, heavy makeup, unnatural poses, cluttered backgrounds

BACKGROUND COLOUR RULE for infographic (apply ALWAYS — critical for text readability on the left panel):
  light grey / white / cream garment  →  deep warm charcoal wall (#2E2B27 tone) or dark slate
  black / dark navy garment           →  warm ivory / off-white linen wall (#F5F1EB tone)
  beige / camel garment               →  deep charcoal OR bright white — whichever gives MORE contrast
  bright / vivid garment              →  muted warm stone, soft warm grey concrete
  The LEFT 40% of the final image MUST be the background colour — smooth, clean, ideal for white/dark text overlay

POSE GUIDE — detect gender from STEP 1 and product type, apply correct pose:

Women:
  Suit (blouse+pants/skirt): calm confident stance, one hand slightly at hip, shows silhouette naturally
  Dress / sundress: light graceful pose, slight fabric movement, shows dress length and drape
  Blouse / shirt: 3/4 or full height, slight body turn toward camera, collar and cuffs visible
  Shorts / skirt: slight hip turn, natural stance, shows garment length and fit
  Outerwear (coat/jacket): straight elegant stance, shows full silhouette and length
  General women style: soft + elegant + slightly feminine; model looks beautiful and expensive, NOT like an influencer

Men:
  Suit / blazer: straight confident stance, shoulders back and relaxed, professional
  Shirt: straight or one hand lightly in pocket, shoulders visible, collar neat
  Pants / jeans: straight stance or slight turn, shows waist and hip fit
  Outerwear: straight stance, hands lightly in pockets, shows volume and length
  T-shirt / hoodie: relaxed but confident stance, shoulders and torso visible
  General men style: confident + clean + masculine; model looks stylish and solid

Use [PRESERVE][CHANGE][SCENE][QUALITY] format:
[PRESERVE] — all product details exactly as seen (color, cut, fabric, visible details, body visibility)
[CHANGE] — recompose: model shifted to right 60% of frame; left 40% is completely clear background; pose corrected per gender+product guide above; remove phone, selfie arm, distracting accessories; fix background to clean studio wall
[SCENE] — describe the SPECIFIC chosen background using BACKGROUND COLOUR RULE above: name the exact wall material and tone (e.g. "smooth deep charcoal plaster wall, uniform #2E2B27, soft diffused light from front-left, beautiful fabric shadow on right edge, zero studio equipment or props visible, perfectly clean for left text panel")
[QUALITY] Genuine photograph, Canon EOS R5, 85mm f/2, natural studio light, real film grain, no AI artifacts.

Also determine: recommendedLayout ("left"|"bottom"|"minimal"), style ("studio"|"lifestyle"|"minimal"|"premium"), textPosition ("left-third"|"bottom"|"overlay").

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — VALID JSON ONLY (no markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
All field values in Russian EXCEPT all promptEn/fluxPrompt fields (English only, NO Cyrillic).

{
  "good": ["конкретный плюс 1 по ЭТОМУ фото", "плюс 2", "плюс 3"],
  "improve": ["конкретная проблема продаж 1", "проблема 2", "проблема 3"],
  "recommendations": {
    "composition": ["конкретное действие по кадру"],
    "technique": ["конкретное действие по свету/фону"],
    "styling": ["конкретное действие по подаче товара — НЕ о модели"]
  },
  "bestAction": {
    "title": "Краткое название улучшения (на русском)",
    "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts."
  },
  "ideas": [
    {"title": "...", "description": "...", "tag": "Главная", "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."},
    {"title": "...", "description": "...", "tag": "Выгода", "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."}
  ],
  "generatePrompt": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.",
  "fluxPrompt": "[PRESERVE] Keep unchanged: [exact product color, cut, fabric, visible body parts, pose]. [CHANGE] Recompose: shift model to right 60% of frame — left 40% must be completely empty clean background; fix pose per gender+product guide; remove any props or accessories. [SCENE] Studio: smooth deep charcoal plaster wall (replace with correct tone from BACKGROUND COLOUR RULE), uniform seamless colour, soft diffused light from front-left, beautiful fabric shadow on right edge, no equipment or props visible, left panel perfectly clean for text overlay. [QUALITY] Genuine photograph, Canon EOS R5, 85mm f/2, natural studio light, real film grain, no AI artifacts.",
  "recommendedLayout": "left",
  "style": "studio",
  "textPosition": "left-third"
}`;


function repairTruncatedJson(s: string): string {
  let inString = false, escaped = false;
  let openBraces = 0, openBrackets = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') openBraces++;
    else if (c === '}') openBraces--;
    else if (c === '[') openBrackets++;
    else if (c === ']') openBrackets--;
  }
  // Strip trailing incomplete field (comma or colon without value)
  let result = s.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  if (inString) result += '"';
  for (let i = 0; i < openBrackets; i++) result += ']';
  for (let i = 0; i < openBraces; i++) result += '}';
  return result;
}

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
        max_tokens: 16000,
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
      let jsonStr = content.slice(jsonStart, jsonEnd + 1);
      try {
        analysis = JSON.parse(jsonStr);
      } catch {
        // JSON was truncated by token limit — repair open strings/arrays/objects
        analysis = JSON.parse(repairTruncatedJson(jsonStr));
      }
    } catch (e) {
      return Response.json({ error: `JSON parse error: ${String(e).slice(0, 200)}` }, { status: 500 });
    }

    return Response.json({ analysis });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
