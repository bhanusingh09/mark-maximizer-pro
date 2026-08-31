import type { MarkRecord, RecordStatus } from "./types";

export function validateRows(rows: MarkRecord[], approved = false): MarkRecord[] {
  const rollCounts = new Map<string, number>();

  for (const row of rows) {
    const rollNumber = row.rollNumber.trim().toLowerCase();
    if (rollNumber) rollCounts.set(rollNumber, (rollCounts.get(rollNumber) ?? 0) + 1);
  }

  return rows.map((row) => {
    const normalizedRoll = row.rollNumber.trim().toLowerCase();
    let issue: string | null = null;

    if (!row.rollNumber.trim()) issue = "Missing roll number";
    else if ((rollCounts.get(normalizedRoll) ?? 0) > 1) issue = "Duplicate roll number";
    else if (!row.studentName.trim()) issue = "Missing student name";
    else if (row.score === null || !Number.isFinite(row.score)) issue = "Missing mark";
    else if (row.score < 0 || row.score > row.maxScore) issue = `Out of range (0–${row.maxScore})`;
    else if (row.confidence < 0.85) issue = "Low OCR confidence";

    const status: RecordStatus = issue ? "flagged" : approved ? "approved" : "verified";
    return { ...row, issue, status };
  });
}
