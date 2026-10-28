import type { PDFDocumentProxy } from "pdfjs-dist";

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

interface Line {
  text: string;
  y: number;
  size: number;
  x: number;
  right: number;
  col: number;
}

const BULLET = /^[•▪■□◦●○·‣∙\-–]\s*/;

function groupRows(items: Item[]): Item[][] {
  const rows: Item[][] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) < Math.max(row[0].size, item.size) * 0.5) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows;
}

function toLine(row: Item[]): Line {
  row.sort((a, b) => a.x - b.x);
  let text = "";
  let prevEnd: number | null = null;
  let size = 0;
  for (const item of row) {
    if (prevEnd !== null && item.x - prevEnd > item.size * 0.2 && !text.endsWith(" ") && !item.str.startsWith(" ")) {
      text += " ";
    }
    text += item.str;
    prevEnd = Math.max(prevEnd ?? 0, item.x + item.width);
    if (item.str.trim()) size = Math.max(size, item.size);
  }
  return { text: text.replace(/\s+/g, " ").trim(), y: row[0].y, size, x: row[0].x, right: prevEnd ?? 0, col: 0 };
}

// 두 단 이상이면 내용 순서를 그대로 쓰고, 한 단이면 위에서 아래로 정렬한다.
function columnSplit(lines: Line[]): number | null {
  if (lines.length < 10) return null;
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.right));
  const mid = (left + right) / 2;
  let spanning = 0;
  let total = 0;
  for (const line of lines) {
    total += line.text.length;
    if (line.x < mid - line.size && line.right > mid + line.size) spanning += line.text.length;
  }
  return spanning / total < 0.3 ? mid : null;
}

function itemsToLines(items: Item[]): Line[] {
  const inOrder = groupRows(items).map(toLine).filter((line) => line.text);
  const mid = columnSplit(inOrder);
  if (mid !== null) {
    for (const line of inOrder) line.col = line.x < mid ? 0 : 1;
    return inOrder;
  }
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  return groupRows(sorted).map(toLine).filter((line) => line.text);
}

function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2;
    weight.set(key, (weight.get(key) ?? 0) + line.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weight) {
    if (w > bestWeight) [best, bestWeight] = [size, w];
  }
  return best || 1;
}

function lineGap(pages: Line[][], body: number): number {
  const count = new Map<number, number>();
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const gap = Math.round(lines[i - 1].y - lines[i].y);
      if (gap > 0 && gap < body * 3) count.set(gap, (count.get(gap) ?? 0) + 1);
    }
  }
  let best = body * 1.2;
  let bestCount = 0;
  for (const [gap, c] of count) {
    if (c > bestCount) [best, bestCount] = [gap, c];
  }
  return best;
}

function headingLevel(size: number, body: number): number {
  const ratio = size / body;
  if (ratio >= 1.6) return 1;
  if (ratio >= 1.3) return 2;
  if (ratio >= 1.12) return 3;
  return 0;
}

// 여러 쪽에 반복되는 머리글·바닥글과 쪽 번호를 지운다.
function stripHeadersFooters(pages: Line[][]): Line[][] {
  const edges = (lines: Line[]) => [...lines.slice(0, 2), ...lines.slice(-2)];
  const key = (line: Line) => line.text.replace(/\d+/g, "#");
  const count = new Map<string, number>();
  for (const lines of pages) {
    for (const k of new Set(edges(lines).map(key))) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const limit = Math.max(3, pages.length * 0.3);
  return pages.map((lines) => {
    const edge = new Set(edges(lines));
    return lines.filter((line) => {
      if (!edge.has(line)) return true;
      if (/^[-–—\s]*\d+[-–—\s]*$/.test(line.text)) return false;
      return (count.get(key(line)) ?? 0) < limit;
    });
  });
}

export async function pdfToMarkdown(doc: PDFDocumentProxy): Promise<string> {
  let pages: Line[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str) continue;
      const [a, b, , , x, y] = raw.transform;
      items.push({ str: raw.str, x, y, width: raw.width, size: raw.height || Math.hypot(a, b) });
    }
    pages.push(itemsToLines(items));
    page.cleanup();
  }
  pages = stripHeadersFooters(pages);

  const body = bodySize(pages.flat());
  const normalGap = lineGap(pages, body);
  const blocks: string[] = [];

  for (const lines of pages) {
    const colRight = [0, 1].map((col) => {
      const rights = lines.filter((l) => l.col === col).map((l) => l.right).sort((a, b) => a - b);
      return rights[Math.floor(rights.length * 0.8)] ?? 0;
    });
    let block: Line[] = [];
    const emit = () => {
      if (!block.length) return;
      const text = block.map((l) => l.text).join(" ");
      const level = headingLevel(block[0].size, body);
      if (level) blocks.push(`${"#".repeat(level)} ${text}`);
      else if (BULLET.test(text)) blocks.push(`- ${text.replace(BULLET, "")}`);
      else blocks.push(text);
      block = [];
    };

    for (const line of lines) {
      const prev = block[block.length - 1];
      const gap = prev ? prev.y - line.y : 0;
      const startsNew =
        !prev ||
        gap <= 0 ||
        gap > Math.max(normalGap * 1.35, prev.size * 1.6) ||
        Math.abs(prev.size - line.size) > 0.5 ||
        BULLET.test(line.text) ||
        /^\d+[.)]\s/.test(line.text) ||
        (prev.right < colRight[prev.col] - body * 3 && !headingLevel(prev.size, body));
      if (startsNew) emit();
      block.push(line);
    }
    emit();
  }

  return blocks.join("\n\n").trim() + "\n";
}
