import type { AuthUser, MarkRecord, ProcessingRun } from './types';
import { parseMarksheetCsv } from './csv';

const USER_KEY = 'markmaxxer-local-user-v1';
const ACCOUNTS_KEY = 'markmaxxer-local-accounts-v1';
const RUNS_KEY = 'markmaxxer-local-runs-v1';

type LocalAccount = AuthUser & { password: string };

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app continues to work for the current session if storage is blocked.
  }
}

export function getLocalUser() {
  return readJson<AuthUser | null>(USER_KEY, null);
}

export function enterDemoLocal() {
  const user: AuthUser = {
    id: 'demo-faculty',
    email: 'faculty@northbridge.edu',
    name: 'Ananya Krishnan',
  };
  writeJson(USER_KEY, user);
  return user;
}

export function signInLocal(email: string, password: string) {
  const account = readJson<LocalAccount | null>(`${ACCOUNTS_KEY}:${email.toLowerCase()}`, null);
  if (!account || account.password !== password) {
    throw new Error('No matching local account. Create an account first.');
  }
  const user = { id: account.id, email: account.email, name: account.name };
  writeJson(USER_KEY, user);
  return user;
}

export function signUpLocal(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const accountKey = `${ACCOUNTS_KEY}:${normalizedEmail}`;
  if (readJson<LocalAccount | null>(accountKey, null)) {
    throw new Error('An account with that email already exists. Sign in instead.');
  }
  const user: AuthUser = {
    id: `local-${crypto.randomUUID()}`,
    email: normalizedEmail,
    name: name.trim(),
  };
  writeJson(accountKey, { ...user, password });
  writeJson(USER_KEY, user);
  return user;
}

export function signOutLocal() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(USER_KEY);
}

export function loadLocalRuns(fallback: ProcessingRun[]) {
  return readJson<ProcessingRun[]>(RUNS_KEY, fallback);
}

export function saveLocalRuns(runs: ProcessingRun[]) {
  writeJson(RUNS_KEY, runs);
}

export async function extractLocalMarksheet(file: File, course: string, section: string, exam: string, maxScore: number) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    const previewRows: MarkRecord[] = ([
      ['24CS041', 'Mira Shah', 18, 0.98],
      ['24CS042', 'Kian Joseph', 16, 0.96],
      ['24CS043', 'Nivedita Rao', 19, 0.94],
      ['24CS044', 'Arjun Menon', 14, 0.91],
      ['24CS045', 'Sana Iqbal', null, 0.69],
      ['24CS046', 'Rohan Das', maxScore + 2, 0.82],
    ] as Array<[string, string, number | null, number]>).map(([rollNumber, studentName, score, confidence], index) => ({
      id: `preview-record-${Date.now()}-${index}`,
      rollNumber,
      studentName,
      score,
      maxScore,
      confidence,
      status: 'verified',
      issue: null,
    }));
    const validated = validatePreviewRows(previewRows, maxScore);
    const flaggedRecords = validated.filter((row) => row.status === 'flagged').length;
    return {
      id: `preview-run-${Date.now()}`,
      filename: file.name,
      course,
      section,
      exam,
      status: 'review' as const,
      totalRecords: validated.length,
      verifiedRecords: validated.length - flaggedRecords,
      flaggedRecords,
      createdAt: new Date().toISOString(),
      rows: validated,
    };
  }
  const importedRows = parseMarksheetCsv(await file.text());
  const rows: MarkRecord[] = importedRows.map((row) => {
    return {
      id: `record-${crypto.randomUUID()}`,
      rollNumber: row.rollNumber,
      studentName: row.studentName,
      score: row.score,
      maxScore,
      confidence: 1,
      status: 'verified',
      issue: null,
    };
  });

  const validated = validatePreviewRows(rows, maxScore);
  const flaggedRecords = validated.filter((row) => row.status === 'flagged').length;
  const run: ProcessingRun & { rows: MarkRecord[] } = {
    id: `run-${Date.now()}`,
    filename: file.name,
    course,
    section,
    exam,
    status: 'review',
    totalRecords: validated.length,
    verifiedRecords: validated.length - flaggedRecords,
    flaggedRecords,
    createdAt: new Date().toISOString(),
    rows: validated,
  };
  return run;
}

function validatePreviewRows(rows: MarkRecord[], maxScore: number) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.rollNumber.trim()) counts.set(row.rollNumber.trim(), (counts.get(row.rollNumber.trim()) ?? 0) + 1);
  });
  return rows.map((row) => {
    let issue: string | null = null;
    if (!row.rollNumber.trim()) issue = 'Missing roll number';
    else if ((counts.get(row.rollNumber.trim()) ?? 0) > 1) issue = 'Duplicate roll number';
    else if (row.score === null) issue = 'Missing mark';
    else if (row.score < 0 || row.score > maxScore) issue = `Out of range (0–${maxScore})`;
    else if (row.confidence < 0.85) issue = 'Low OCR confidence';
    return { ...row, issue, status: issue ? 'flagged' as const : 'verified' as const };
  });
}
