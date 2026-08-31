export type RecordStatus = "verified" | "flagged" | "approved";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type MarkRecord = {
  id: string;
  rollNumber: string;
  studentName: string;
  score: number | null;
  maxScore: number;
  confidence: number;
  status: RecordStatus;
  issue: string | null;
};

export type ProcessingRun = {
  id: string;
  filename: string;
  filePath: string;
  mimeType: string;
  course: string;
  section: string;
  exam: string;
  maxScore: number;
  sourceKind: "csv" | "pdf";
  extractionMethod: "csv" | "pdf-text" | "pdf-ocr";
  status: "review" | "approved";
  totalRecords: number;
  verifiedRecords: number;
  flaggedRecords: number;
  createdAt: string;
  updatedAt: string;
  rows?: MarkRecord[];
};
