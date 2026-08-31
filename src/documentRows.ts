export type ParsedDocumentRow = {
  rollNumber: string;
  studentName: string;
  score: number | null;
  confidence: number;
};

const ABSENT_MARKERS = new Set(["ab", "absent", "na", "n/a", "-"]);
const HEADER_WORDS = /\b(roll|registration|student|candidate|name|mark|marks|score|maximum|max)\b/i;

function cleanCell(value: string) {
  return value.replace(/^['"`|:;,[\]{}()]+|['"`|:;,[\]{}()]+$/g, "").trim();
}

function parseScore(value: string) {
  const cleaned = cleanCell(value).toLowerCase();
  if (ABSENT_MARKERS.has(cleaned)) return { recognized: true, score: null };
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?$/);
  return match ? { recognized: true, score: Number(match[1]) } : { recognized: false, score: null };
}

function looksLikeRollNumber(value: string) {
  const cleaned = cleanCell(value);
  return (
    cleaned.length > 0 &&
    cleaned.length <= 40 &&
    /\d/.test(cleaned) &&
    /^[a-z0-9][a-z0-9_./-]*$/i.test(cleaned)
  );
}

function parseLine(line: string, confidence: number): ParsedDocumentRow | null {
  const normalized = line
    .replace(/[\t|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || (HEADER_WORDS.test(normalized) && !/\d/.test(normalized))) return null;

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 3) return null;

  const scoreResult = parseScore(parts.at(-1) ?? "");
  if (!scoreResult.recognized) return null;

  let rollIndex = 0;
  if (
    /^\d+[.)]?$/.test(parts[0] ?? "") &&
    looksLikeRollNumber(parts[1] ?? "") &&
    parts.length >= 4
  ) {
    rollIndex = 1;
  }

  const rollNumber = cleanCell(parts[rollIndex] ?? "");
  const studentName = parts
    .slice(rollIndex + 1, -1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    !looksLikeRollNumber(rollNumber) ||
    !/[a-z]/i.test(studentName) ||
    HEADER_WORDS.test(studentName)
  )
    return null;

  return {
    rollNumber,
    studentName,
    score: scoreResult.score,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function parseDocumentRows(lines: string[], confidence = 1): ParsedDocumentRow[] {
  const parsed: ParsedDocumentRow[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const row = parseLine(line, confidence);
    if (!row) continue;
    const signature = `${row.rollNumber.toLowerCase()}\u0000${row.studentName.toLowerCase()}\u0000${row.score ?? ""}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    parsed.push(row);
  }

  return parsed;
}
