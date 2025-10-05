import { clsx } from "clsx";

export const cn = (...inputs: Array<string | false | null | undefined>) =>
  clsx(...inputs);

export const formatNumber = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};

export const formatPercentChange = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const formatted = formatNumber(Math.abs(value), { maximumFractionDigits: 1 });
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
};
