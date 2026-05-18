import type { GoogleSheetUnit } from '@/types';

// ─── CSV Export (работает без авторизации для публичных таблиц) ─────────────

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '';

function csvExportUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function csvGvizUrl(gid: string) {
  // hl=en форсирует запятую как разделитель (без него некоторые локали используют ;)
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&hl=en`;
}

function parseCsv(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  // Обрабатываем посимвольно — поддерживает многострочные ячейки в кавычках
  let i = 0;
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      inQuotes = !inQuotes;
      i++;
    } else if (ch === sep && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
      i++;
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell.trim());
      if (cells.some((c) => c)) rows.push(cells);
      cells = [];
      cell = '';
      i++;
    } else {
      cell += ch;
      i++;
    }
  }
  if (cell || cells.length) {
    cells.push(cell.trim());
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

function detectSepAndParse(text: string): string[][] {
  // Определяем разделитель по первой строке: если ';' встречается больше ',' — используем ';'
  const firstLine = text.slice(0, 500);
  const commas = (firstLine.match(/,/g) || []).length;
  const semis  = (firstLine.match(/;/g) || []).length;
  const sep = semis > commas ? ';' : ',';
  // eslint-disable-next-line no-console
  if (sep === ';') console.log('[Sheets] Обнаружен разделитель ";"');
  return parseCsv(text, sep);
}

async function fetchSheetCsv(gid: string): Promise<string[][]> {
  // eslint-disable-next-line no-console
  console.log(`[Sheets] Fetching GID=${gid} from spreadsheet ${SPREADSHEET_ID}`);
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID не задан в .env.local');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  };

  const urls = [csvExportUrl(gid), csvGvizUrl(gid)];
  let lastErr: unknown;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(45000),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error('Таблица закрыта. Открой доступ: Настройки доступа → "Читатель" → "Все, у кого есть ссылка"');
      }
      if (!res.ok) throw new Error(`CSV export HTTP ${res.status}`);

      const text = await res.text();
      if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
        throw new Error('Таблица требует авторизацию Google. Открой доступ по ссылке (Читатель).');
      }

      const parsed = detectSepAndParse(text);

      // gviz иногда возвращает merged-ячейки вместо отдельных столбцов.
      // Если первая строка с данными имеет <5 столбцов — результат некорректный, пробуем следующий URL.
      const maxCols = parsed.slice(0, 5).reduce((m, r) => Math.max(m, r.length), 0);
      if (maxCols < 5) {
        // eslint-disable-next-line no-console
        console.warn(`[Sheets] ${url.includes('gviz') ? 'gviz' : 'export'} вернул только ${maxCols} столбцов — пропускаем`);
        lastErr = new Error(`Слишком мало столбцов (${maxCols}) — возможно merged-ячейки`);
        continue;
      }

      return parsed;
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.log(`[Sheets] ${url.includes('gviz') ? 'gviz' : 'export'} неудача: ${err}`);
    }
  }

  throw lastErr;
}

function findSheetGid(sheetName: string): string {
  const knownGids: Record<string, string> = {
    'Unit': process.env.UNIT_GID || '526155247',
  };
  const name = process.env[`SHEET_${sheetName.toUpperCase().replace(/[^A-Z]/g, '_')}_GID`];
  return name || knownGids[sheetName] || '0';
}

// Нормализация: ё→е, убираем лишние пробелы (CSV может передавать разные варианты написания)
function normalizeRu(s: string): string {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// Ищем колонку по ключевым словам в заголовке (все слова должны присутствовать)
function findField(headers: string[], values: string[], ...keywords: string[]): string | null {
  const idx = headers.findIndex((h) => {
    const normalized = normalizeRu(h);
    return keywords.every((kw) => normalized.includes(normalizeRu(kw)));
  });
  if (idx === -1 || (values[idx] ?? '') === '') return null;
  return values[idx];
}

// ─── Unit ────────────────────────────────────────────────────────────────────

export async function fetchUnitData(article: string): Promise<GoogleSheetUnit | null> {
  const sheetName = process.env.SHEET_UNIT || 'Unit';

  try {
    const gid = findSheetGid(sheetName);
    const rows = await fetchSheetCsv(gid);

    if (rows.length < 3) {
      return { found: false, article, headers: [], values: [], rawText: 'Лист Unit пуст' };
    }

    // Строка 1 (index 0): заголовок (может быть English)
    // Строка 2 (index 1): видимый заголовок (Russian), колонка F = "SKU"
    // Используем строку с наибольшим количеством непустых столбцов — она и есть настоящий заголовок
    const candidateRows = [rows[1], rows[0]].filter(Boolean) as string[][];
    const headers = candidateRows.reduce((best, r) =>
      r.filter((c) => c.trim()).length > best.filter((c) => c.trim()).length ? r : best,
      candidateRows[0] || []
    );
    // eslint-disable-next-line no-console
    console.log(`[Unit] заголовки (всего ${headers.length} столбцов):`, JSON.stringify(headers));
    const dataRows = rows.slice(2).filter((r) => r.some((c) => c.trim()));

    const NM_ID_COL = 5; // Колонка F = nm_id / SKU

    let row = dataRows.find((r) => (r[NM_ID_COL] || '').toString().trim() === article);
    if (!row) {
      row = dataRows.find((r) => r.some((c) => (c || '').toString().trim() === article));
    }

    if (!row) {
      return {
        found: false,
        article,
        headers,
        values: [],
        rawText: `Артикул ${article} не найден в листе "${sheetName}"`,
      };
    }

    // Извлекаем только нужные поля — поддерживаем и русские, и английские заголовки
    // English: sebes_rub | Russian: закупка
    const zakupka   = findField(headers, row, 'sebes')
                   ?? findField(headers, row, 'закупка');

    // English: kargo / cargo / markirovka_rub | Russian: карго
    const kargo     = findField(headers, row, 'kargo')
                   ?? findField(headers, row, 'cargo')
                   ?? findField(headers, row, 'карго')
                   ?? findField(headers, row, 'markirovka');

    // English: delivery_mp_with_buyout | Russian: логистика мп финотчет
    const logistika = findField(headers, row, 'delivery_mp_with_buyout')
                   ?? findField(headers, row, 'delivery', 'buyout')
                   ?? findField(headers, row, 'логистика', 'мп', 'финотчет')
                   ?? findField(headers, row, 'логистика', 'финотчет')
                   ?? findField(headers, row, 'логистика', 'мп');

    // English: per_day_storage_fee_report | Russian: хранение финотчет/день
    const hranenie  = findField(headers, row, 'per_day_storage_fee_report')
                   ?? findField(headers, row, 'storage', 'report')
                   ?? findField(headers, row, 'хранение', 'финотчет')
                   ?? findField(headers, row, 'хранение', 'день');

    // English: perc_mp_rub_finreport | Russian: % МП руб финотчет (комиссия WB в рублях)
    const percMpRub = findField(headers, row, 'perc_mp_rub_finreport')
                   ?? findField(headers, row, 'мп', 'руб', 'финотчет');

    // English: acquiring_perc | Russian: эквайринг средний 30д
    const ekvairing = findField(headers, row, 'acquiring_perc')
                   ?? findField(headers, row, 'acquiring')
                   ?? findField(headers, row, 'эквайринг');

    // НДС: колонка "НДС 22% и 10%" в таблице имеет English-ключ "additional_costs"
    // (не путать с tax_total_rub = "Налог итого" — это другая колонка)
    const ndsRub    = findField(headers, row, 'additional_costs')
                   ?? findField(headers, row, 'nds_22')
                   ?? findField(headers, row, 'nds');
    const ndsPerc   = findField(headers, row, 'vat_perc')
                   ?? findField(headers, row, 'tax_total_perc')
                   ?? findField(headers, row, 'ндс', '22')
                   ?? findField(headers, row, 'ндс');
    // Предпочитаем ₽ (additional_costs), если нет — берём % (ИИ пересчитает)
    const nds = ndsRub ?? ndsPerc;

    // eslint-disable-next-line no-console
    console.log('[Unit] найдено:', { zakupka, kargo, logistika, hranenie, percMpRub, ekvairing, nds });

    const fieldLines = [
      zakupka    !== null ? `Закупка (себестоимость): ${zakupka}`                    : 'Закупка: не найдена',
      kargo      !== null ? `Карго: ${kargo}`                                         : 'Карго: не найдено',
      logistika  !== null ? `Логистика МП с % выкупа (финотчет): ${logistika}`       : 'Логистика МП (финотчет): не найдена',
      hranenie   !== null ? `Хранение в день (финотчет): ${hranenie}`                : 'Хранение в день (финотчет): не найдено',
      percMpRub  !== null ? `Комиссия WB (% МП, руб., финотчет): ${percMpRub}`      : 'Комиссия WB (руб.): не найдена',
      ekvairing  !== null ? `Эквайринг (средний 30Д): ${ekvairing}`                  : 'Эквайринг: не найден',
      nds        !== null ? (ndsRub !== null ? `НДС (итого, руб.): ${nds}` : `НДС (ставка %): ${nds}`) : 'НДС: не найден',
    ];

    const rawText = [
      `Артикул: ${article}`,
      ...fieldLines,
    ].join('\n');

    return { found: true, article, headers, values: row, rawText };
  } catch (err) {
    throw new Error(`fetchUnitData: ${err}`);
  }
}
