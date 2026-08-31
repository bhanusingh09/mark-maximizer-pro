import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentRows } from "./documentRows.ts";

test("parses common PDF table rows and ignores headings", () => {
  assert.deepEqual(
    parseDocumentRows([
      "Roll Number Student Name Marks",
      "1 24CS041 Mira Shah 18",
      "24CS042 Kian Joseph 16/20",
      "Total students 2",
    ]),
    [
      { rollNumber: "24CS041", studentName: "Mira Shah", score: 18, confidence: 1 },
      { rollNumber: "24CS042", studentName: "Kian Joseph", score: 16, confidence: 1 },
    ],
  );
});

test("preserves genuine missing marks from the document", () => {
  assert.deepEqual(parseDocumentRows(["24CS043 Sana Iqbal Absent"], 0.76), [
    { rollNumber: "24CS043", studentName: "Sana Iqbal", score: null, confidence: 0.76 },
  ]);
});

test("does not manufacture rows from prose or incomplete text", () => {
  assert.deepEqual(
    parseDocumentRows(["Internal Assessment 2", "Data Structures", "24CS044 Rohan Das"]),
    [],
  );
});
