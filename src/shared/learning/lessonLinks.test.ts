import { describe, expect, test } from 'vitest';
import { allowedLinkHost } from './lessonLinks';

describe('allowedLinkHost', () => {
  test.each([
    { url: 'https://owasp.org/x', allowed: true },
    { url: 'https://cheatsheetseries.owasp.org/x', allowed: true },
    { url: 'https://OWASP.ORG/x', allowed: true },
    { url: 'https://cwe.mitre.org/data/definitions/78.html', allowed: true },
    { url: 'https://portswigger.net/web-security', allowed: true },
    { url: 'https://owasp.org.evil.example/x', allowed: false },
    { url: 'https://evil.example/owasp.org', allowed: false },
    { url: 'http://owasp.org/x', allowed: false },
    { url: 'javascript:alert(1)', allowed: false },
    { url: 'data:text/html,x', allowed: false },
    { url: 'not a url', allowed: false },
  ])('$url is allowed: $allowed', ({ url, allowed }) => {
    // given
    const href = url;
    // when
    const got = allowedLinkHost(href);
    // then
    expect(got).toBe(allowed);
  });
});
