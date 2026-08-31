export type RecordStatus = 'verified' | 'flagged' | 'approved';

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
  course: string;
  section: string;
  exam: string;
  status: 'review' | 'approved' | 'processing';
  totalRecords: number;
  verifiedRecords: number;
  flaggedRecords: number;
  createdAt: string;
  rows?: MarkRecord[];
};
