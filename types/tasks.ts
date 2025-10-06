export type TaskStatus = "queued" | "running" | "completed" | "error" | string;

export type TaskRunStatus =
  | "queued"
  | "running"
  | "running_with_errors"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | string;

export type TaskMetadata = {
  source: "root" | "rising";
  root_id: string;
  root_keyword: string;
  root_label: string;
  baseline?: string;
  seed_origin?: string;
  news_id?: string;
  news_source?: string | null;
  news_title?: string | null;
  news_published_at?: string | null;
  candidate_id?: string;
  candidate_source?: string | null;
  candidate_llm_label?: string | null;
  candidate_llm_score?: number | null;
  candidate_captured_at?: string | null;
  locale?: string;
  time_range?: string;
  location_name?: string;
  location_code?: number;
  language_name?: string;
  discovery_depth?: number;
  parent_task_id?: string;
  parent_keyword?: string;
};

export type TaskRunListItem = {
  id: string;
  triggeredAt: string;
  status: TaskRunStatus;
  triggerSource?: string | null;
  rootKeywords: string[];
  metadata: Record<string, unknown>;
  taskCounts: {
    total: number;
    completed: number;
    queued: number;
    error: number;
  };
  costTotal: number;
};

export type TaskRunDetail = {
  run: TaskRunListItem;
  tasks: RunTaskItem[];
};

export type RunTaskItem = {
  taskId: string;
  status: TaskStatus;
  keyword: string;
  locale: string;
  timeframe: string;
  postedAt: string | null;
  completedAt: string | null;
  metadata?: TaskMetadata;
  request?: Record<string, unknown> | null;
  result?: unknown;
  cost?: number | null;
  errorMessage?: string | null;
};
