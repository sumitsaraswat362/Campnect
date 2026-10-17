export function sanitizeUserInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+=["'][^"']*["']/gi, '')
    .trim();
}

export function isValidCampusUrl(url: string, allowedHostSuffixes = ['.ac.in', '.edu.in', '.edu', 'campnect.app']): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return allowedHostSuffixes.some((suffix) => parsed.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([\`*_{}\[\]()#+-.!~])/g, '\\$1');
}
