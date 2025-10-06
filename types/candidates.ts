export type CandidateRow = {
  id: string;
  term: string;
  source: string;
  status: string;
  llm_label: string | null;
  llm_score: number | null;
  captured_at: string;
  expires_at: string;
  queried_at: string | null;
  rejection_reason: string | null;
};

