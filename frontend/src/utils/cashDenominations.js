export const DEFAULT_CASH_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const roundDenomination = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
};

export const normalizeCashDenominations = (values) => {
  const source = Array.isArray(values) && values.length ? values : DEFAULT_CASH_DENOMINATIONS;
  const unique = new Map();

  source.forEach((value) => {
    const rounded = roundDenomination(value);
    if (rounded == null) return;
    unique.set(String(rounded), rounded);
  });

  const normalized = Array.from(unique.values()).sort((a, b) => b - a);
  return normalized.length ? normalized : [...DEFAULT_CASH_DENOMINATIONS];
};

export const formatCashDenomination = (value) => {
  const rounded = roundDenomination(value);
  if (rounded == null) return "";
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
};

export const denominationKey = (value) => formatCashDenomination(value);

export const buildDenominationCounts = (denominations, current = {}) =>
  Object.fromEntries(
    normalizeCashDenominations(denominations).map((value) => {
      const key = denominationKey(value);
      return [key, current?.[key] ?? ""];
    })
  );

export const calcDenominationTotal = (denominations, counts = {}) =>
  normalizeCashDenominations(denominations).reduce((total, value) => {
    const count = Number(counts?.[denominationKey(value)] || 0);
    return total + value * (Number.isFinite(count) ? count : 0);
  }, 0);

export const hasAnyDenominationInput = (counts = {}) =>
  Object.values(counts).some((value) => String(value ?? "").trim() !== "");
