// CSV の読み込み（RFC 4180 相当。ダブルクォート、セル内の改行・カンマ、CRLF、BOM に対応）。
// Excel の「CSV（コンマ区切り）」は Shift_JIS で保存されるため、UTF-8 として読めなければ Shift_JIS として読む。

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'shift_jis';
}

export function decodeCsvBytes(bytes: Uint8Array): DecodedText {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('shift_jis').decode(bytes), encoding: 'shift_jis' };
  }
}

/** CSV を行の配列（各行はセルの配列）にする。行番号は 1 始まりで lines に入る */
export function parseCsv(text: string): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  const src = text.replace(/^﻿/, '');

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    lines.push(rowStartLine);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStartLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) endRow();

  // セル内の改行は "\r\n" を "\n" にそろえる
  return { rows: rows.map((r) => r.map((c) => c.replace(/\r\n?/g, '\n'))), lines };
}

/** すべてのセルが空の行か */
export const isBlankRow = (row: readonly string[]): boolean => row.every((c) => c.trim() === '');

/** CSV のセルに書き出す（カンマ・改行・ダブルクォートを含むときは囲む） */
export function toCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
