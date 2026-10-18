import { connect } from 'node:net';

setTimeout(() => process.exit(0), 900);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let notificationType = null;
  try {
    notificationType = JSON.parse(input).notification_type ?? null;
  } catch {
    notificationType = null;
  }
  const line = JSON.stringify({ tabId: process.env.MAPLE_TAB_ID ?? '', event: process.argv[2], notificationType });
  const socket = connect(process.env.MAPLE_SOCKET ?? '', () => {
    socket.end(`${line}\n`, () => process.exit(0));
  });
  socket.on('error', () => process.exit(0));
});
