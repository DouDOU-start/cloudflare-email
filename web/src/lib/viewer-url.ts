export function viewerURL(url: string): string;
export function viewerURL(url: undefined): undefined;
export function viewerURL(url: string | undefined): string | undefined;
export function viewerURL(url: string | undefined) {
  if (!url) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}
