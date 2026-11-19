// ============================================================================
// REAL TWS COMMERCE SYSTEM — PARSER NATIVO XLSX (OpenXML) Y CSV UTF-8
// Soporta:
//   - Descompresión ZIP / deflate-raw mediante Web Compression Streams API
//   - Detección automática de hojas (xl/workbook.xml + xl/_rels/workbook.xml.rels)
//   - Lectura de sharedStrings, inlineStr, números y fórmulas
//   - Detección inteligente de fila de encabezados (fila 1 o fila 4 en plantillas)
//   - Lectura y exportación de archivos CSV UTF-8 con BOM para compatibilidad Excel
// ============================================================================

export interface ParsedSheet {
  name: string;
  sheetIndex: number;
  headerRowNumber: number;
  headers: Record<string, string>; // ColLetter -> HeaderText
  rows: Record<number, Record<string, string>>; // RowNumber -> { ColLetter -> Value }
  totalDataRows: number;
}

export interface ParsedWorkbook {
  filename: string;
  format: 'XLSX' | 'CSV_UTF8';
  byteSize: number;
  fileHash: string;
  sheetNames: string[];
  sheets: Record<string, ParsedSheet>;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function indexToColLetter(idxZeroBased: number): string {
  let n = idxZeroBased + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes.slice(0, 12))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const bytes = new Uint8Array(buffer);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  writer.write(copy);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.byteLength;
    }
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function unzipXlsxEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const files: Record<string, string> = {};

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Archivo XLSX inválido: no se encontró el directorio central ZIP (EOCD).');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries; idx++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (
      !fileName.endsWith('.xml') &&
      !fileName.endsWith('.rels')
    ) {
      continue;
    }

    const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      files[fileName] = decoder.decode(rawSlice);
    } else if (compressionMethod === 8) {
      const inflated = await inflateRawBytes(rawSlice);
      files[fileName] = decoder.decode(inflated);
    }
  }

  return files;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const result: string[] = [];
  const siMatches = xml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    // Excluir guías fonéticas <rPh> para no contaminar el texto real de la celda
    const cleanedSi = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    const tMatches = [...cleanedSi.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
    result.push(decodeXmlEntities(tMatches.map((m) => m[1]).join('')));
  }
  return result;
}

function detectHeaderRowNumber(rows: Record<number, Record<string, string>>): number {
  const rowNums = Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);

  if (rowNums.includes(4)) {
    const r4Values = Object.values(rows[4] || {}).filter((v) => v.trim() !== '');
    if (r4Values.length >= 3) {
      return 4;
    }
  }

  for (const rNum of rowNums.slice(0, 8)) {
    const nonEmpty = Object.values(rows[rNum] || {}).filter((v) => v.trim() !== '');
    if (nonEmpty.length >= 3) {
      return rNum;
    }
  }

  return rowNums[0] || 1;
}

function parseWorksheetXml(
  sheetName: string,
  sheetIndex: number,
  xml: string,
  sharedStrings: string[]
): ParsedSheet {
  const rows: Record<number, Record<string, string>> = {};
  const rowRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rMatch: RegExpExecArray | null;
  let fallbackRowNum = 0;

  while ((rMatch = rowRegex.exec(xml)) !== null) {
    const rowAttrs = rMatch[1] || '';
    const rowBody = rMatch[2] || '';
    fallbackRowNum += 1;
    if (!rowBody) continue;
    const rowNumMatch = rowAttrs.match(/\br="(\d+)"/);
    const rowNum = rowNumMatch ? parseInt(rowNumMatch[1], 10) : fallbackRowNum;
    fallbackRowNum = rowNum;
    const rowCells: Record<string, string> = {};

    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cMatch: RegExpExecArray | null;

    while ((cMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cMatch[1];
      const content = cMatch[2] || '';
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const colLetter = refMatch[1];
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      const vMatch = content.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = content.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);

      let value = '';
      if (cellType === 's' && vMatch) {
        const ssIdx = parseInt(vMatch[1], 10);
        value = sharedStrings[ssIdx] ?? '';
      } else if (cellType === 'inlineStr' && isMatch) {
        value = decodeXmlEntities(isMatch[1]);
      } else if (vMatch) {
        value = decodeXmlEntities(vMatch[1]);
      }

      if (value !== '') {
        rowCells[colLetter] = value.trim();
      }
    }

    if (Object.keys(rowCells).length > 0) {
      rows[rowNum] = rowCells;
    }
  }

  const headerRowNumber = detectHeaderRowNumber(rows);
  const headers: Record<string, string> = { ...(rows[headerRowNumber] || {}) };
  const totalDataRows = Object.keys(rows)
    .map(Number)
    .filter((r) => r > headerRowNumber).length;

  return {
    name: sheetName,
    sheetIndex,
    headerRowNumber,
    headers,
    rows,
    totalDataRows
  };
}

export async function parseXlsxBuffer(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParsedWorkbook> {
  const fileHash = await computeBufferHash(buffer);
  const entries = await unzipXlsxEntries(buffer);
  const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml']);

  const workbookXml = entries['xl/workbook.xml'] || '';
  const relsXml = entries['xl/_rels/workbook.xml.rels'] || '';

  const relTargetById: Record<string, string> = {};
  const relMatches = [...relsXml.matchAll(/<Relationship\b([^>]+)>/g)];
  for (const rm of relMatches) {
    const attrs = rm[1];
    const idMatch = attrs.match(/\bId="([^"]+)"/);
    const targetMatch = attrs.match(/\bTarget="([^"]+)"/);
    if (!idMatch || !targetMatch) continue;
    const rawTarget = targetMatch[1].replace(/^\/+/, '');
    relTargetById[idMatch[1]] = rawTarget.startsWith('xl/') ? rawTarget : `xl/${rawTarget}`;
  }

  const sheetNames: string[] = [];
  const sheets: Record<string, ParsedSheet> = {};

  const sheetMatches = [...workbookXml.matchAll(/<sheet\b([^>]+)>/g)];

  sheetMatches.forEach((sm, idx) => {
    const attrs = sm[1];
    const nameMatch = attrs.match(/\bname="([^"]+)"/);
    const ridMatch = attrs.match(/\br:id="([^"]+)"/);
    if (!nameMatch || !ridMatch) return;
    const name = decodeXmlEntities(nameMatch[1]);
    const rId = ridMatch[1];
    const targetPath = relTargetById[rId] || `xl/worksheets/sheet${idx + 1}.xml`;
    const sheetXml = entries[targetPath] || '';
    sheetNames.push(name);
    sheets[name] = parseWorksheetXml(name, idx + 1, sheetXml, sharedStrings);
  });

  return {
    filename,
    format: 'XLSX',
    byteSize: buffer.byteLength,
    fileHash,
    sheetNames,
    sheets
  };
}

export function parseCsvRecords(text: string, delimiter?: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  if (!cleanText.trim()) return [];
  const firstLineEnd = cleanText.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? cleanText : cleanText.slice(0, firstLineEnd);
  const sep =
    delimiter ??
    ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',');

  const records: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (ch === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && cleanText[i + 1] === '\n') i++;
      row.push(current.trim());
      if (row.some((cell) => cell !== '')) {
        records.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  row.push(current.trim());
  if (row.some((cell) => cell !== '')) {
    records.push(row);
  }
  return records;
}

export async function parseCsvUtf8Text(
  text: string,
  filename: string
): Promise<ParsedWorkbook> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(text).buffer;
  const fileHash = await computeBufferHash(buffer);

  const parsedRecords = parseCsvRecords(text);
  if (parsedRecords.length === 0) {
    throw new Error('El archivo CSV UTF-8 está vacío.');
  }

  const rows: Record<number, Record<string, string>> = {};
  parsedRecords.forEach((values, lineIdx) => {
    const rowCells: Record<string, string> = {};
    values.forEach((val, colIdx) => {
      if (val !== '') {
        rowCells[indexToColLetter(colIdx)] = val;
      }
    });
    if (Object.keys(rowCells).length > 0) {
      rows[lineIdx + 1] = rowCells;
    }
  });

  const headers: Record<string, string> = { ...(rows[1] || {}) };
  const sheetName = 'CSV_IMPORT_DATA';
  const parsedSheet: ParsedSheet = {
    name: sheetName,
    sheetIndex: 1,
    headerRowNumber: 1,
    headers,
    rows,
    totalDataRows: Math.max(0, Object.keys(rows).length - 1)
  };

  return {
    filename,
    format: 'CSV_UTF8',
    byteSize: buffer.byteLength,
    fileHash,
    sheetNames: [sheetName],
    sheets: {
      [sheetName]: parsedSheet
    }
  };
}

export function exportRowsToCsvUtf8(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Prevenir CSV Formula Injection en Excel/Sheets (preservando números negativos puros)
    if (
      typeof val !== 'number' &&
      /^[=+\-@\t\r]/.test(str) &&
      !/^-\d+(?:[.,]\d+)?$/.test(str.trim())
    ) {
      str = `'${str}`;
    }
    if (/[",\r\n;]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(','))
  ].join('\r\n');

  // UTF-8 BOM (\uFEFF) ensures Excel opens accents cleanly
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
