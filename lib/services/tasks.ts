import {
  getRunTaskCostTotal,
  getRunTaskStatusCounts,
  getTasksByRunId,
  getTrendRunById,
  listTrendRuns,
  type TrendRunRow,
  type TrendsTaskRow,
} from "@/lib/supabase";
import type { Json } from "@/types/supabase";
import type { RunTaskItem, TaskMetadata, TaskRunDetail, TaskRunListItem } from "@/types/tasks";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecord = (value: Json | null | undefined): Record<string, unknown> => {
  if (!value || !isObject(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
};

const isTaskMetadata = (value: unknown): value is TaskMetadata => {
  if (!isObject(value)) {
    return false;
  }

  const metadata = value as TaskMetadata;
  return (
    typeof metadata.root_id === "string" &&
    typeof metadata.root_keyword === "string" &&
    typeof metadata.root_label === "string" &&
    (metadata.baseline === undefined || typeof metadata.baseline === "string") &&
    (metadata.discovery_depth === undefined || typeof metadata.discovery_depth === "number")
  );
};

const toTaskMetadata = (value: unknown): TaskMetadata | undefined => {
  if (isTaskMetadata(value)) {
    return value;
  }

  return undefined;
};

type ParsedTaskPayload = {
  metadata?: TaskMetadata;
  request?: Record<string, unknown> | null;
  result?: unknown;
};

const parseTaskPayload = (value: Json | null | undefined): ParsedTaskPayload => {
  const record = toRecord(value);

  const metadata = toTaskMetadata(record.metadata);
  const request = isObject(record.request) ? (record.request as Record<string, unknown>) : null;
  const result = record.result ?? undefined;

  return { metadata, request, result };
};

const parseErrorMessage = (value: Json | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (isObject(value)) {
    const message = typeof value.message === "string" ? value.message : null;
    const statusMessage = typeof value.status_message === "string" ? value.status_message : null;
    const detail = typeof value.detail === "string" ? value.detail : null;

    return message ?? statusMessage ?? detail;
  }

  return null;
};

const toTaskRunListItem = (
  run: TrendRunRow,
  counts: { total: number; completed: number; queued: number; error: number },
  costTotal: number
): TaskRunListItem => {
  const metadataRecord = toRecord(run.metadata);
  const rootKeywords = Array.isArray(run.root_keywords) ? run.root_keywords : [];

  return {
    id: run.id,
    triggeredAt: run.triggered_at,
    status: run.status,
    triggerSource: run.trigger_source,
    rootKeywords,
    metadata: metadataRecord,
    taskCounts: counts,
    costTotal,
  } satisfies TaskRunListItem;
};

export const resolveTaskRunList = async (limit = 20): Promise<TaskRunListItem[]> => {
  const runs = await listTrendRuns(limit);

  if (runs.length === 0) {
    return [];
  }

  const [counts, costs] = await Promise.all([
    Promise.all(runs.map((run) => getRunTaskStatusCounts(run.id))),
    Promise.all(runs.map((run) => getRunTaskCostTotal(run.id))),
  ]);

  return runs.map((run, index) =>
    toTaskRunListItem(
      run,
      counts[index] ?? { total: 0, completed: 0, queued: 0, error: 0 },
      typeof costs[index] === "number" && Number.isFinite(costs[index]) ? (costs[index] as number) : 0
    )
  );
};

const toRunTaskItem = (row: TrendsTaskRow): RunTaskItem => {
  const payload = parseTaskPayload(row.payload);

  return {
    taskId: row.task_id,
    status: row.status,
    keyword: row.keyword,
    locale: row.locale,
    timeframe: row.timeframe,
    postedAt: row.posted_at,
    completedAt: row.completed_at,
    metadata: payload.metadata,
    request: payload.request ?? null,
    result: payload.result,
    cost: typeof row.cost === "number" ? row.cost : null,
    errorMessage: parseErrorMessage(row.error),
  } satisfies RunTaskItem;
};

export const resolveTaskRunDetail = async (runId: string): Promise<TaskRunDetail | null> => {
  const run = await getTrendRunById(runId);
  if (!run) {
    return null;
  }

  const [counts, taskRows] = await Promise.all([
    getRunTaskStatusCounts(runId),
    getTasksByRunId(runId),
  ]);

  const costTotal = taskRows.reduce((accumulator, row) => {
    const cost = typeof row.cost === "number" ? Number(row.cost) : 0;
    return accumulator + (Number.isFinite(cost) ? cost : 0);
  }, 0);

  const runItem = toTaskRunListItem(run, counts, costTotal);
  const tasks = taskRows.map(toRunTaskItem);

  return {
    run: runItem,
    tasks,
  } satisfies TaskRunDetail;
};
