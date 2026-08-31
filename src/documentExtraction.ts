import { parseMarksheetCsv } from "./csv";
import { parseDocumentRows, type ParsedDocumentRow } from "./documentRows";
import type { MarkRecord, ProcessingRun } from "./types";
import { validateRows } from "./validation";

type ExtractionProgress = (progress: number, message: string) => void;

export type ExtractionResult = {
  rows: MarkRecord[];
  sourceKind: ProcessingRun["sourceKind"];
  extractionMethod: ProcessingRun["extractionMethod"];
};

const MAX_PDF_PAGES = 12;
const MAX_OCR_PAGES = 5;

function toMarkRecords(parsed: ParsedDocumentRow[], maxScore: number) {
  const rows: MarkRecord[] = parsed.map((row) => ({
    id: crypto.randomUUID(),
    rollNumber: row.rollNumber,
    studentName: row.studentName,
    score: row.score,
    maxScore,
    confidence: row.confidence,
    status: "verified",
    issue: null,
  }));
  return validateRows(rows);
}

function groupPdfTextItems(items: unknown[]) {
  const positioned = items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const value = item as { str: string; transform: number[] };
    const text = value.str.trim();
    if (!text || value.transform.length < 6) return [];
    return [{ text, x: value.transform[4] ?? 0, y: value.transform[5] ?? 0 }];
  });

  const lines: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
  for (const item of positioned) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push({ text: item.text, x: item.x });
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" "),
    );
}

async function loadPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

async function extractPdfRows(file: File, onProgress: ExtractionProgress) {
  onProgress(12, "Opening PDF");
  const pdf = await loadPdf(file);
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(
      `This PDF has ${pdf.numPages} pages. For a reliable demo, use a marksheet with ${MAX_PDF_PAGES} pages or fewer.`,
    );
  }

  const pages = [];
  const textLines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(page);
    const content = await page.getTextContent();
    textLines.push(...groupPdfTextItems(content.items));
    onProgress(
      15 + Math.round((pageNumber / pdf.numPages) * 35),
      `Reading PDF page ${pageNumber} of ${pdf.numPages}`,
    );
  }

  const textRows = parseDocumentRows(textLines, 1);
  if (textRows.length > 0) {
    return { rows: textRows, extractionMethod: "pdf-text" as const };
  }

  if (pdf.numPages > MAX_OCR_PAGES) {
    throw new Error(
      `No table text was found. Scanned-PDF OCR is limited to ${MAX_OCR_PAGES} pages for this demo.`,
    );
  }

  const { recognize } = await import("tesseract.js");
  const ocrRows: ParsedDocumentRow[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page) continue;
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not prepare the PDF for OCR.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const result = await recognize(canvas, "eng", {
      logger: (event) => {
        if (event.status !== "recognizing text") return;
        const pageShare = 40 / pages.length;
        onProgress(
          50 + Math.round(index * pageShare + event.progress * pageShare),
          `Running OCR on page ${index + 1} of ${pages.length}`,
        );
      },
    });
    const confidence = Math.max(0.5, Math.min(0.99, result.data.confidence / 100));
    ocrRows.push(...parseDocumentRows(result.data.text.split(/\r?\n/), confidence));
  }

  if (ocrRows.length === 0) {
    throw new Error(
      "No student rows could be read from this PDF. Use a clearer PDF or a CSV with Roll number, Student name, and Marks columns.",
    );
  }
  return { rows: ocrRows, extractionMethod: "pdf-ocr" as const };
}

export async function extractMarksheet(
  file: File,
  maxScore: number,
  onProgress: ExtractionProgress = () => undefined,
): Promise<ExtractionResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    onProgress(20, "Reading CSV");
    const parsed = parseMarksheetCsv(await file.text()).map((row) => ({ ...row, confidence: 1 }));
    onProgress(90, "Validating rows");
    return { rows: toMarkRecords(parsed, maxScore), sourceKind: "csv", extractionMethod: "csv" };
  }

  if (lowerName.endsWith(".pdf")) {
    const extracted = await extractPdfRows(file, onProgress);
    onProgress(92, "Validating rows");
    return {
      rows: toMarkRecords(extracted.rows, maxScore),
      sourceKind: "pdf",
      extractionMethod: extracted.extractionMethod,
    };
  }

  throw new Error("Choose a CSV or PDF marksheet. Other file types are not used in this demo.");
}
