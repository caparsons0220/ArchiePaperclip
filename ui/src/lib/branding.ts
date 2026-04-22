const PRODUCT_TITLE_SEPARATOR = " \u00b7 ";
const PAPERCLIP_HOST_PATTERN = /(^|\.)paperclip\.ing$/i;

function isUpstreamPaperclipUrl(value: string) {
  try {
    return PAPERCLIP_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return /paperclip\.ing/i.test(value);
  }
}

function normalizeExternalUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return isUpstreamPaperclipUrl(normalized) ? null : normalized;
}

export const PRODUCT_NAME = "Archie Bravo";
export const FEEDBACK_SHARING_TARGET = PRODUCT_NAME;
export const PRODUCT_DOCS_URL = normalizeExternalUrl(import.meta.env.VITE_DOCS_URL);
export const FEEDBACK_TERMS_URL = normalizeExternalUrl(import.meta.env.VITE_FEEDBACK_TERMS_URL);

export function formatDocumentTitle(parts: readonly string[]) {
  return parts.length > 0
    ? `${parts.join(PRODUCT_TITLE_SEPARATOR)}${PRODUCT_TITLE_SEPARATOR}${PRODUCT_NAME}`
    : PRODUCT_NAME;
}

export function formatVersionLabel(version: string) {
  return `${PRODUCT_NAME} v${version}`;
}
