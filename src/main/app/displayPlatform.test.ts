import { describe, expect, test, vi } from 'vitest';
import { preferX11OnLinux } from './displayPlatform';

describe('preferX11OnLinux', () => {
  test.each([
    { platform: 'linux', want: [['ozone-platform', 'x11']] },
    { platform: 'darwin', want: [] },
    { platform: 'win32', want: [] },
    { platform: 'freebsd', want: [] },
  ] as const)('on $platform appends $want', ({ platform, want }) => {
    // given
    const commandLine = { appendSwitch: vi.fn() };
    // when
    preferX11OnLinux(commandLine, platform);
    // then
    expect(commandLine.appendSwitch.mock.calls).toEqual(want);
  });
});
