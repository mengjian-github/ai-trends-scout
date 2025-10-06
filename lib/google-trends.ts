export const buildGoogleTrendsUrl = (keyword: string) => {
  const normalized = keyword.trim();
  const queryParam = normalized.length > 0 ? `&q=${encodeURIComponent(normalized)}` : "";
  return `https://trends.google.com/trends/explore?date=now%207-d${queryParam}`;
};
