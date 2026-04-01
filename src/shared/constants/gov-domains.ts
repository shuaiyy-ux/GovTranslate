export const GOV_TLDS = ['.gov', '.mil'];

export function isGovernmentUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return GOV_TLDS.some((tld) => host.endsWith(tld));
  } catch {
    return false;
  }
}

export function isGoogleTranslatePage(): boolean {
  const host = location.hostname.toLowerCase();
  return host.includes('translate.google') || host.includes('translate.googleusercontent') || host.endsWith('.translate.goog');
}

export function isPdfUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}
