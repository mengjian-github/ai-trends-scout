import { ingestNewsFeeds, type IngestStats } from "@/lib/news/ingest";
import { collectExternalCandidateRoots } from "@/lib/signals/collectors";
import {
  evaluatePendingCandidates,
  expireStaleCandidates,
  recordCandidateRoots,
  type CandidateEvaluationStats,
  type RecordCandidateStats,
} from "@/lib/services/candidates";

export type SignalHarvestSummary = {
  news: IngestStats;
  candidates: RecordCandidateStats & {
    externalCounts: Record<string, number>;
    errors: Array<{ source: string; error: string }>;
    newsCandidateCount: number;
  };
  llm: CandidateEvaluationStats;
  expirations: { expired: number };
};

export const harvestSignals = async (): Promise<SignalHarvestSummary> => {
  const newsStats = await ingestNewsFeeds();
  const externalOutcome = await collectExternalCandidateRoots();
  const newsCandidateCount = newsStats.candidateRoots.length;
  const allCandidates = [...newsStats.candidateRoots, ...externalOutcome.entries];

  const recordStats = await recordCandidateRoots(allCandidates);
  const expiration = await expireStaleCandidates();
  const llmStats = await evaluatePendingCandidates();

  const sanitizedNews: IngestStats = {
    ...newsStats,
    candidateRoots: [],
  };

  return {
    news: sanitizedNews,
    candidates: {
      ...recordStats,
      externalCounts: externalOutcome.counts,
      errors: externalOutcome.errors,
      newsCandidateCount,
    },
    llm: llmStats,
    expirations: { expired: expiration.updated },
  };
};
