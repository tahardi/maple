import type { CommandLine } from 'electron';

export function preferX11OnLinux(commandLine: Pick<CommandLine, 'appendSwitch'>, platform: NodeJS.Platform): void {
  if (platform === 'linux') {
    commandLine.appendSwitch('ozone-platform', 'x11');
  }
}
