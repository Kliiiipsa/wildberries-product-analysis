import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export const runtime = 'edge';
export const maxDuration = 30;

const MAX_INPUT_CHARS = 400;
const MAX_OUTPUT_TOKENS = 600;

export async function POST(req: NextRequest) {
  const { message, context, rawContext, article } = await req.json();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Нет сообщения' }), { status: 400 });
  }
  if (message.length > MAX_INPUT_CHARS) {
    return new Response(JSON.stringify({ error: `Максимум ${MAX_INPUT_CHARS} символов` }), { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API ключ не настроен' }), { status: 500 });
  }

  const groq = new Groq({ apiKey });

  const dataSection = rawContext
    ? `РЕАЛЬНЫЕ ДАННЫЕ ТОВАРА (источник: WB API, Google Sheets, Mpstats):\n${rawContext.slice(0, 7000)}`
    : `АНАЛИЗ ТОВАРА:\n${context?.slice(0, 6000) || 'Нет данных'}`;

  const systemPrompt = `Ты WB-аналитик. Отвечаешь на вопросы по конкретному товару артикул ${article}.

${dataSection}

${rawContext && context ? `ИТОГОВЫЙ AI-АНАЛИЗ (для ссылок на этапы):\n${context.slice(0, 2000)}` : ''}

ПРАВИЛА:
- Отвечай кратко и конкретно, максимум 150 слов
- Ссылайся на номера этапов: "в этапе 1.1", "этап 4.2" и т.д.
- Используй только реальные цифры из данных выше, не придумывай
- НЕ используй LaTeX, только обычный текст и символы ×, ÷, ₽, %`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.3,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
        });

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
