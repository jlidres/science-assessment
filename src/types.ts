export interface Option {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  number: number;
  prompt: string;
  options: Option[];
  correctAnswer: string;
}

export interface StudentInfo {
  studentName: string;
  studentId: string;
  section: string;
}

export interface AttemptRecord {
  attemptId: string;
  submittedAt: string;
  studentName: string;
  studentId: string;
  section: string;
  score: number;
  totalItems: number;
  percentage: number;
  answers: Record<string, string>;
  questionOrder: string[];
}