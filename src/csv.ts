export type CsvMarksheetRow = {
  rollNumber: string;
  studentName: string;
  score: number | null;
};

const MAX_CSV_RECORDS = 5_000;

const HEADER_ALIASES = {
  rollNumber: [
    'roll',
    'roll no',
    'roll number',
    'registration',
    'registration no',
    'registration number',
    'reg no',
    'reg number',
    'student id',
    'student no',
    'student number',
    'enrollment no',
    'enrollment number',
    'enrolment no',
    'enrolment number',
  ],
  studentName: ['name', 'student', 'student name', 'full name', 'student full name', 'candidate name'],
  score: ['mark', 'marks', 'score', 'marks obtained', 'mark obtained', 'obtained marks', 'total', 'total marks', 'total score'],
} as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeaderIndex(headers: string[], aliases: readonly string[]) {
  const accepted = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => accepted.has(normalizeHeader(header)));
}

/**
 * Parse an RFC 4180-style CSV document. Quoted commas, escaped quotes, CRLF,
 * and newlines inside quoted cells are supported.
 */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };

  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.length > 0)) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else if (character === '\r' && text[index + 1] === '\n') {
        cell += '\n';
        index += 1;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.trim().length === 0) {
      quoted = true;
    } else if (character === ',') {
      pushCell();
    } else if (character === '\n' || character === '\r') {
      pushRow();
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}

export function parseMarksheetCsv(text: string): CsvMarksheetRow[] {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('The CSV does not contain any student records.');

  const headers = table[0];
  const rollIndex = findHeaderIndex(headers, HEADER_ALIASES.rollNumber);
  const nameIndex = findHeaderIndex(headers, HEADER_ALIASES.studentName);
  const scoreIndex = findHeaderIndex(headers, HEADER_ALIASES.score);

  const missingHeaders = [
    rollIndex < 0 ? 'Roll number' : null,
    nameIndex < 0 ? 'Student name' : null,
    scoreIndex < 0 ? 'Marks' : null,
  ].filter((header): header is string => header !== null);

  if (missingHeaders.length > 0) {
    throw new Error(`The CSV is missing ${missingHeaders.join(', ')}. Use columns named Roll number, Student name, and Marks.`);
  }

  const records = table.slice(1);
  if (records.length > MAX_CSV_RECORDS) {
    throw new Error(`The CSV contains more than ${MAX_CSV_RECORDS.toLocaleString()} student records.`);
  }

  return records.map((cells) => {
    const rawScore = cells[scoreIndex]?.trim() ?? '';
    const normalizedScore = rawScore.toLowerCase();
    const scoreIsMissing = ['', 'na', 'n/a', 'ab', 'absent', '-'].includes(normalizedScore);
    const numericScore = scoreIsMissing ? null : Number(rawScore);

    return {
      rollNumber: cells[rollIndex]?.trim() ?? '',
      studentName: cells[nameIndex]?.trim() ?? '',
      score: typeof numericScore === 'number' && Number.isFinite(numericScore) ? numericScore : null,
    };
  });
}
