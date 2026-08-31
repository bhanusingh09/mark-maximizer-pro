import assert from "node:assert/strict";
import test from "node:test";
import type { MarkRecord } from "./types.ts";
import { validateRows } from "./validation.ts";

function row(overrides: Partial<MarkRecord>): MarkRecord {
  return {
    id: crypto.randomUUID(),
    rollNumber: "24CS001",
    studentName: "Aditi Rao",
    score: 18,
    maxScore: 20,
    confidence: 1,
    status: "verified",
    issue: null,
    ...overrides,
  };
}

test("flags only problems present in parsed or edited rows", () => {
  const rows = validateRows([
    row({ rollNumber: "24CS001" }),
    row({ rollNumber: "24CS001", studentName: "Second Student" }),
    row({ rollNumber: "24CS002", studentName: "" }),
    row({ rollNumber: "24CS003", score: 25 }),
    row({ rollNumber: "24CS004", confidence: 0.7 }),
  ]);

  assert.deepEqual(
    rows.map((item) => item.issue),
    [
      "Duplicate roll number",
      "Duplicate roll number",
      "Missing student name",
      "Out of range (0–20)",
      "Low OCR confidence",
    ],
  );
});

test("marks clean rows approved only when finalizing", () => {
  assert.equal(validateRows([row({})])[0]?.status, "verified");
  assert.equal(validateRows([row({})], true)[0]?.status, "approved");
});
