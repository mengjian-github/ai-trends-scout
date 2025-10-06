import { openRouterApiKey, openRouterModel } from "@/lib/env";

export type DemandDecisionLabel = "tool" | "non_tool" | "unclear";

export type KeywordDemandAssessment = {
  enabled: boolean;
  label: DemandDecisionLabel;
  score: number | null;
  reason: string | null;
  demandSummary: string | null;
};

export type KeywordDemandRequest = {
  keyword: string;
  rootKeyword?: string;
  parentKeyword?: string;
  locale?: string;
  timeframe?: string;
  spikeScore?: number | null;
  notes?: string | null;
};

const MODEL = openRouterModel ?? "anthropic/claude-3-haiku";

const CACHE = new Map<string, KeywordDemandAssessment>();

const LABEL_ALIASES: Record<string, DemandDecisionLabel> = {
  tool: "tool",
  ai_tool: "tool",
  software: "tool",
  software_tool: "tool",
  productized: "tool",
  yes: "tool",
  non_tool: "non_tool",
  none: "non_tool",
  "not_tool": "non_tool",
  "no": "non_tool",
  unclear: "unclear",
  unknown: "unclear",
};

const normalizeLabel = (value: string | null | undefined): DemandDecisionLabel => {
  if (!value) {
    return "unclear";
  }

  const key = value.trim().toLowerCase();
  return LABEL_ALIASES[key] ?? (key === "tool" ? "tool" : key === "non_tool" ? "non_tool" : "unclear");
};

const toCacheKey = (params: KeywordDemandRequest) =>
  [
    params.keyword,
    params.rootKeyword ?? "",
    params.parentKeyword ?? "",
    params.locale ?? "",
    params.timeframe ?? "",
    params.spikeScore ?? "",
    params.notes ?? "",
  ]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("::");

const buildPrompt = (params: KeywordDemandRequest) => {
  const lines: string[] = [];
  lines.push(`Keyword: ${params.keyword}`);
  if (params.rootKeyword) {
    lines.push(`Root Keyword: ${params.rootKeyword}`);
  }
  if (params.parentKeyword && params.parentKeyword !== params.keyword) {
    lines.push(`Parent Keyword: ${params.parentKeyword}`);
  }
  if (params.locale) {
    lines.push(`Locale: ${params.locale}`);
  }
  if (params.timeframe) {
    lines.push(`Timeframe: ${params.timeframe}`);
  }
  if (typeof params.spikeScore === "number") {
    lines.push(`Spike Score: ${params.spikeScore}`);
  }
  if (params.notes) {
    lines.push(`Notes: ${params.notes}`);
  }

  lines.push(
    "Task: Decide whether searchers behind this keyword are likely seeking a software tool, automation, or online service that can directly satisfy the need. Focus on practical, actionable demand."
  );
  lines.push(
    "If no software or automation solution would directly help, classify the term as non_tool. When unsure, mark unclear."
  );
  lines.push("Summarize the underlying user task in one concise sentence if you classify it as tool or unclear.");
  lines.push(
    "Return strict JSON: {\"label\":\"tool|non_tool|unclear\",\"score\":number 0-1,\"demand_summary\":string,\"reason\":string}."
  );

  return lines.join("\n");
};

const fallbackAssessment: KeywordDemandAssessment = {
  enabled: false,
  label: "tool",
  score: null,
  reason: null,
  demandSummary: null,
};

export const assessKeywordDemand = async (
  params: KeywordDemandRequest
): Promise<KeywordDemandAssessment> => {
  if (!openRouterApiKey) {
    return fallbackAssessment;
  }

  const cacheKey = toCacheKey(params);
  const cached = CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prompt = buildPrompt(params);

  const body = {
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You classify search keywords by whether they indicate demand for a software tool, automation, or online service. Respond with strict JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-trends-scout",
        "X-Title": "AI Trends Scout",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} - ${text}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenRouter response missing content");
    }

    const parsed = JSON.parse(content) as {
      label?: string;
      score?: number;
      reason?: string;
      demand_summary?: string;
      summary?: string;
    };

    const label = normalizeLabel(parsed.label);
    const score = typeof parsed.score === "number" && Number.isFinite(parsed.score) ? parsed.score : null;
    const demandSummary = typeof parsed.demand_summary === "string"
      ? parsed.demand_summary.trim()
      : typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : null;

    const assessment: KeywordDemandAssessment = {
      enabled: true,
      label,
      score,
      reason,
      demandSummary: demandSummary && demandSummary.length > 0 ? demandSummary : null,
    };

    CACHE.set(cacheKey, assessment);
    return assessment;
  } catch (error) {
    console.error("Failed to assess keyword demand", {
      keyword: params.keyword,
      error,
    });

    const assessment: KeywordDemandAssessment = {
      enabled: true,
      label: "unclear",
      score: null,
      reason: `llm_error: ${(error as Error).message}`,
      demandSummary: null,
    };

    CACHE.set(cacheKey, assessment);
    return assessment;
  }
};

export const isToolDemand = (assessment: KeywordDemandAssessment | null | undefined) => {
  if (!assessment) {
    return true;
  }

  if (!assessment.enabled) {
    return true;
  }

  return assessment.label !== "non_tool";
};

export const sanitizeDemandAssessment = (assessment: KeywordDemandAssessment | null | undefined) => {
  if (!assessment) {
    return undefined;
  }

  return {
    label: assessment.label,
    score: assessment.score,
    reason: assessment.reason,
    summary: assessment.demandSummary,
    updated_at: new Date().toISOString(),
  } as const;
};
