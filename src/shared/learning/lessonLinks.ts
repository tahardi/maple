export const LESSON_LINK_HOSTS: readonly string[] = ['owasp.org', 'cwe.mitre.org', 'portswigger.net'];

export function allowedLinkHost(href: string, hosts: readonly string[] = LESSON_LINK_HOSTS): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return hosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
}
