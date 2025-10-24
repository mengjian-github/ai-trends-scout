const FILTER_REASON_LABELS: Record<string, string> = {
  missing_location: "缺少链接",
  invalid_url: "URL 无效",
  root_path: "首页路径",
  excluded_by_rule: "命中排除规则",
  not_matched_by_include_rule: "未匹配收录规则",
  insufficient_path_segments: "路径层级过少",
  last_segment_blocked_exact: "路径后缀被黑名单过滤",
  last_segment_blocked_pattern: "路径后缀匹配敏感模式",
  numeric_last_segment: "路径后缀仅包含数字",
  last_segment_too_short: "路径后缀过短",
  last_segment_too_long: "路径后缀过长",
  last_segment_contains_dot: "路径后缀包含扩展名",
  shallow_path_without_media: "浅层路径且缺少媒体信息",
  normalized_empty: "提取的关键词为空",
  normalized_too_short: "提取的关键词过短",
  normalized_too_long: "提取的关键词过长",
  duplicate_keyword: "重复关键词",
};

export const formatFilterReason = (reason: string) => FILTER_REASON_LABELS[reason] ?? reason;

export const getFilterReasonLabel = (reason: string) => FILTER_REASON_LABELS[reason] ?? reason;

export default FILTER_REASON_LABELS;
