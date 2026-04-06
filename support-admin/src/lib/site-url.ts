import "server-only";

const LOCALHOST_URL = "http://localhost:3000";

function normalizeOrigin(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue.startsWith("http")
    ? trimmedValue
    : `https://${trimmedValue}`;

  return normalizedValue.replace(/\/+$/, "");
}

export function getSiteUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.SITE_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_URL;

  return normalizeOrigin(siteUrl ?? "") ?? LOCALHOST_URL;
}

export function getAbsoluteUrl(pathname: string) {
  return new URL(pathname, getSiteUrl()).toString();
}
