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
STEP 5 — INFOGRAPHIC BASE (fluxPrompt)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate a FLUX Kontext image-to-image prompt that produces a natural, unified infographic base.

PHILOSOPHY: The result must look like a single cohesive photograph — never a collage. Preserve the original photo's soul: lighting character, colour grade, atmosphere, mood, time of day, grain, depth of field. FLUX makes only the minimal composition adjustment needed to create natural breathing room for text overlay.

━━━
FIRST — READ THE COMPOSITION:
━━━
Before writing the prompt, determine:
• Where is the natural negative space? (blurred background, open sky, empty wall area, open floor, bokeh zone, space beside model)
• Which side has more open/empty space → textSide: "left" | "right" | "top" | "bottom"
• What background element can naturally be extended? (blurred foliage, studio backdrop, concrete wall, sky, floor, etc.)
• Is there already enough clean space for text? → if YES, [EXTEND] should say "composition already has natural space on [side] — no significant changes needed"

━━━
PROMPT FORMAT: [PRESERVE] [EXTEND] [QUALITY]
━━━

[PRESERVE] List EVERY detail that must stay identical:
- Clothing: exact colour, cut, fabric, every visible detail (drawstrings, buttons, lace, collar, cuffs)
- Pose: model's exact pose — pixel-perfect identical. DO NOT change pose under any circumstances.
- Atmosphere: lighting character (soft/hard, direction, colour temperature), colour grade, mood, time of day
- Environment type: what kind of place it is (park, studio, street, interior — preserve this completely)
- Visual texture: grain, depth of field, bokeh character
- If no face visible in original: do NOT add or generate a face

[EXTEND] Minimal composition adjustment — describe how to naturally expand existing negative space:
- Name the specific background element to extend (e.g. "blurred green foliage", "grey studio backdrop", "concrete wall", "open sky above")
- Direction: left / right / upper-left / upper-right / etc.
- Emphasise: same depth-of-field, identical colour temperature, identical texture — just MORE of what already exists
- CRITICAL — BRIGHTNESS: the extended zone MUST maintain the original exposure and brightness of the photo. Do NOT darken it. Do NOT add gradients, vignettes, or shadows. The extended area must be naturally light and airy, matching the original illumination exactly.
- If space already exists: "Composition already provides natural breathing room on the [side] — no changes needed, preserve as-is"
- NEVER create: artificial empty zones, solid-colour panels, darkened areas, gradient overlays
- NEVER change: pose, lighting character, colour grade, atmosphere, environment type

[QUALITY] Genuine photograph. Pose unchanged. No new objects. No lighting changes. No style changes. Real film grain. No AI artifacts.

━━━
EXAMPLES:
━━━
Park / nature photo:
"[PRESERVE] Identical light blue oversized linen shirt and wide-leg trousers, model's exact pose with hands raised — pose pixel-perfect unchanged. Pearl necklace, white sandals. Warm natural daylight through park trees, soft dappled light, lush green blurred bokeh background, warm colour grade, real film grain, shallow depth of field. [EXTEND] The natural blurred green foliage on the left side gently expands further — same depth-of-field, identical warm colour temperature, identical bokeh softness, same bright natural daylight exposure. The extended zone must stay light and airy, matching the original sunny brightness exactly — no darkening, no gradients, no shadows added. [QUALITY] Genuine photograph. Pose unchanged. No AI artifacts."

Studio photo:
"[PRESERVE] [clothing details], exact pose unchanged. Soft grey seamless studio backdrop, diffused front lighting, same shadow gradients, same colour grade. [EXTEND] The grey studio backdrop naturally extends further on the left — same seamless paper texture, same neutral tone, same even studio exposure. No darkening, no added gradients. [QUALITY] Genuine photograph. No style changes. No AI artifacts."

Street / urban photo:
"[PRESERVE] [clothing details], exact pose unchanged. Evening city street, warm light pools from streetlamps, blurred building facades, blue-hour atmosphere, same colour temperature and grain. [EXTEND] The blurred building wall on the right expands — same evening warm bokeh, same blue-hour tone, same exposure level. No new objects, no additional darkening. [QUALITY] Genuine photograph. Pose unchanged. No AI artifacts."

Photo with already good composition:
"[PRESERVE] [all details]. [EXTEND] Composition already provides natural breathing room on the left side — no significant changes needed. Preserve existing exposure and brightness exactly as-is. [QUALITY] Genuine photograph. No AI artifacts."

━━━
Also determine:

PHASE A — COMPOSITION ANALYSIS:
• textSide: "left" | "right" | "bottom" — which side has the most natural space for text
• composition.subjectZone: where the main subject/model is — "center" | "left" | "right"
• composition.freeZones: all zones with natural negative space — e.g. ["left", "top-left"]
• composition.primaryTextZone: single best zone — "left" | "right" | "top" | "bottom" | "top-left" | "top-right"
• composition.textZoneReason: 1 sentence explaining why this zone is best for text

PHASE B — OVERLAY STYLE:
• overlayStyle.layoutTemplate — choose based on WHERE THE SUBJECT IS in the frame:
    "side-left"   → subject/model on the RIGHT or right-center of the frame → text goes on the LEFT side column
    "side-right"  → subject/model on the LEFT or left-center of the frame → text goes on the RIGHT side column
    "bottom-band" → subject is CENTERED filling most of the height, OR full-body dynamic pose with no clear side space, OR flat-lay / product-only — text goes in a horizontal block at the BOTTOM

• overlayStyle.colorScheme — analyse the text zone background:
    "light" → background in text zone is bright/pale → use dark text on it
    "dark"  → background in text zone is dark/shadowed → use light text on it

• overlayStyle.textColorHex — exact hex for main text:
    Light scheme → near-black warm e.g. "#18140D" | "#1C1812" | "#221A0E"
    Dark scheme  → near-white warm e.g. "#EDE9E1" | "#F2EEE6" | "#E8E4DC"

• overlayStyle.scrimOpacity — 0.05 to 0.13 ONLY. This is a nearly invisible gradient behind the text zone, purely for readability. NEVER exceed 0.13. On clean studio shots use 0.05–0.07. On busy lifestyle shots use 0.09–0.13.

• overlayStyle.scrimDirection — matches the text zone: "left" | "right" | "bottom"

• overlayStyle.shadowIntensity — text drop-shadow alpha: 0.15 to 0.35. Clean bright zone → 0.18. Dark or busy zone → 0.30–0.35.

• fluxExtendNote: 1 sentence — what FLUX will extend and why

━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — INFOGRAPHIC TEXT VARIANTS (textVariants)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate EXACTLY 4 text variants for the infographic canvas. ALL text values in RUSSIAN.

RULES for every variant:
• productName — 2-3 words MAX, uppercase-friendly, SPECIFIC to THIS exact product (e.g. "ШОРТЫ МУЖСКИЕ", "ПЛАТЬЕ ЛЕТНЕЕ", "РУБАШКА ОВЕРСАЙЗ")
• subtitle — 3-7 words, feel/fit/feature of the item
• tagline — 3-5 word lowercase slug for the top of card (e.g. "новинка сезона", "хит продаж")
• characteristics — EXACTLY 3 items, each: title 1-3 words + value 2-6 words
• bottomText — 5-9 words memorable closing line

THE 4 APPROACHES:
[0] approach "Выгоды" — WHY BUYER SHOULD BUY: comfort, quality, value, convenience. Example: productName "ШОРТЫ МУЖСКИЕ", bullets: {Дышит летом, Мягкий хлопок}, {Не жмёт, Эластичный пояс}, {Носи везде, Универсальный крой}
[1] approach "Характеристики" — WHAT IT IS: material %, fit type, season, construction. Example: bullets: {Состав, 95% хлопок 5% эластан}, {Посадка, свободный оверсайз}, {Сезон, лето / весна}
[2] approach "Эмоции" — HOW IT MAKES YOU FEEL: aspiration, image, self-expression, lifestyle. productName may be "СТИЛЬНЫЙ ОБРАЗ" or similar. Bullets are short aspirational phrases without values.
[3] approach "Минимализм" — ULTRA MINIMAL: shortest possible product name (1 word ok), very brief bullets (title only, no value needed), minimal everything

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
  "generatePromptRu": "Краткое описание на русском (2-3 предложения): что именно изменится (фон, поза, обрезка и т.д.) и почему это улучшит конверсию карточки. Например: «Заменить загромождённый фон на однотонную тёмно-серую стену — это создаст сильный контраст с жёлтым комплектом и улучшит кликабельность в ленте Wildberries.»",
  "fluxPrompt": "[PRESERVE] Keep unchanged: [exact clothing colour, cut, fabric, every visible detail], model's exact pose — pixel-perfect identical, do not change pose. [lighting character, colour grade, atmosphere, environment type]. Real film grain, depth of field. [If no face: do NOT add face.] [EXTEND] [name the specific background element] on the [direction] side gently expands further — same depth-of-field, identical colour temperature, identical texture, just more of what already exists. No new objects, no new colours, no style changes. [QUALITY] Genuine photograph. Pose unchanged. No new objects. No lighting changes. Real film grain. No AI artifacts.",
  "textSide": "left",
  "recommendedLayout": "left",
  "style": "lifestyle",
  "textPosition": "left-third",
  "composition": {
    "subjectZone": "center",
    "freeZones": ["left"],
    "primaryTextZone": "left",
    "textZoneReason": "..."
  },
  "overlayStyle": {
    "layoutTemplate": "side-left",
    "colorScheme": "light",
    "textColorHex": "#18140D",
    "scrimOpacity": 0.08,
    "scrimDirection": "left",
    "shadowIntensity": 0.26
  },
  "fluxExtendNote": "...",
  "textVariants": [
    {"approach": "Выгоды",        "productName": "...", "subtitle": "...", "tagline": "...", "characteristics": [{"title":"...","value":"..."},{"title":"...","value":"..."},{"title":"...","value":"..."}], "bottomText": "..."},
    {"approach": "Характеристики","productName": "...", "subtitle": "...", "tagline": "...", "characteristics": [{"title":"...","value":"..."},{"title":"...","value":"..."},{"title":"...","value":"..."}], "bottomText": "..."},
    {"approach": "Эмоции",        "productName": "...", "subtitle": "...", "tagline": "...", "characteristics": [{"title":"...","value":""},   {"title":"...","value":""},   {"title":"...","value":""}],   "bottomText": "..."},
    {"approach": "Минимализм",    "productName": "...", "subtitle": "...", "tagline": "...", "characteristics": [{"title":"...","value":""},   {"title":"...","value":""},   {"title":"...","value":""}],   "bottomText": "..."}
  ]
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
