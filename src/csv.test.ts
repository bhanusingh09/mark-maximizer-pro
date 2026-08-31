import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, parseMarksheetCsv } from './csv.ts';

test('imports the documented marksheet columns', () => {
  assert.deepEqual(
    parseMarksheetCsv('Roll number,Student name,Marks\n21CS001,Aditi Rao,18'),
    [{ rollNumber: '21CS001', studentName: 'Aditi Rao', score: 18 }],
  );
});

test('recognizes common header aliases without confusing Student ID for the name', () => {
  assert.deepEqual(
    parseMarksheetCsv('Student ID,Full Name,Score\r\n21CS002,Aarav Mehta,16'),
    [{ rollNumber: '21CS002', studentName: 'Aarav Mehta', score: 16 }],
  );
});

test('supports quoted commas, escaped quotes, and multiline values', () => {
  assert.deepEqual(
    parseCsv('Roll number,Student name,Marks\n21CS003,"Riya, ""RJ""\nKapoor",19'),
    [
      ['Roll number', 'Student name', 'Marks'],
      ['21CS003', 'Riya, "RJ"\nKapoor', '19'],
    ],
  );
});

test('treats blank and attendance markers as missing marks', () => {
  const rows = parseMarksheetCsv('\uFEFFRoll No,Name,Marks Obtained\n1,One,\n2,Two,NA\n3,Three,Absent');
  assert.deepEqual(rows.map((row) => row.score), [null, null, null]);
});

test('reports missing headers and malformed quoted fields', () => {
  assert.throws(
    () => parseMarksheetCsv('Roll number,Marks\n21CS004,17'),
    /missing Student name/,
  );
  assert.throws(
    () => parseCsv('Roll number,Student name,Marks\n21CS004,"Ishaan Gupta,17'),
    /unclosed quoted value/,
  );
});
