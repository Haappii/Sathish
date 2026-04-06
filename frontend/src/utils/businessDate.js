import { getSession, setSession } from "./auth";

const BUSINESS_DATE_KEY = "hb_business_date";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

const pad = (value) => String(value).padStart(2, "0");

export function systemDateIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function normalizeBusinessDate(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoMatch = trimmed.match(ISO_DATE_RE);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export function parseBusinessDate(value) {
  const iso = normalizeBusinessDate(value);
  if (!iso) return null;

  const [year, month, day] = iso.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getBusinessDate(fallbackValue) {
  const session = getSession() || {};
  const fromSession = normalizeBusinessDate(session?.app_date);
  if (fromSession) return fromSession;

  if (typeof localStorage !== "undefined") {
    const stored = normalizeBusinessDate(localStorage.getItem(BUSINESS_DATE_KEY));
    if (stored) return stored;
  }

  const fallback = normalizeBusinessDate(fallbackValue);
  return fallback || systemDateIso();
}

export function syncBusinessDate(value) {
  const iso = normalizeBusinessDate(value);
  if (!iso) return "";

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(BUSINESS_DATE_KEY, iso);
  }

  const session = getSession();
  if (session && normalizeBusinessDate(session.app_date) !== iso) {
    setSession({
      ...session,
      app_date: iso,
    });
  }

  return iso;
}

export function addDaysToBusinessDate(value, days) {
  const baseDate = parseBusinessDate(value) || parseBusinessDate(systemDateIso());
  if (!baseDate) return systemDateIso();

  baseDate.setDate(baseDate.getDate() + Number(days || 0));
  return normalizeBusinessDate(baseDate);
}

export function startOfBusinessMonth(value) {
  const baseDate = parseBusinessDate(value) || parseBusinessDate(systemDateIso());
  if (!baseDate) return systemDateIso();

  return `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-01`;
}

export function formatBusinessDate(value, locale = "en-GB", options = {}) {
  const parsed = parseBusinessDate(value);
  if (!parsed) return "";

  const dateOptions = Object.keys(options).length
    ? options
    : { day: "2-digit", month: "short", year: "numeric" };
  return parsed.toLocaleDateString(locale, dateOptions);
}

export function buildBusinessDateTimeLabel(
  value = getBusinessDate(),
  {
    locale = "en-IN",
    dateOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
    timeOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" },
    timeValue = new Date(),
  } = {}
) {
  const datePart = formatBusinessDate(value, locale, dateOptions) || getBusinessDate();
  const parsedTime = timeValue instanceof Date ? timeValue : new Date(timeValue);
  const timePart = Number.isNaN(parsedTime.getTime())
    ? ""
    : parsedTime.toLocaleTimeString([], timeOptions);

  return timePart ? `${datePart}, ${timePart}` : datePart;
}

