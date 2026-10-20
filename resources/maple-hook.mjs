import { connect } from 'node:net';

setTimeout(() => process.exit(0), 900);

function send(line) {
  const socket = connect(process.env.MAPLE_SOCKET ?? '', () => {
    socket.end(`${line}\n`, () => process.exit(0));
  });
  socket.on('error', () => process.exit(0));
}

function parse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function usageWindow(window) {
  return window ? { usedPercentage: window.used_percentage, resetsAt: window.resets_at } : null;
}

function statusLine(input) {
  const limits = parse(input)?.rate_limits;
  if (!limits) {
    process.exit(0);
  }
  const usage = { fiveHour: usageWindow(limits.five_hour), sevenDay: usageWindow(limits.seven_day) };
  const parts = [];
  if (usage.fiveHour) {
    parts.push(`5h ${Math.round(usage.fiveHour.usedPercentage)}%`);
  }
  if (usage.sevenDay) {
    parts.push(`7d ${Math.round(usage.sevenDay.usedPercentage)}%`);
  }
  process.stdout.write(parts.join(' · '));
  send(JSON.stringify({ usage }));
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  if (process.argv[2] === 'StatusLine') {
    statusLine(input);
    return;
  }
  const notificationType = parse(input)?.notification_type ?? null;
  send(JSON.stringify({ tabId: process.env.MAPLE_TAB_ID ?? '', event: process.argv[2], notificationType }));
});
