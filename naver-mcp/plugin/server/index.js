#!/usr/bin/env node
// 플러그인용 실행기: 프록시 환경이면 Node fetch 가 프록시를 쓰도록 켠 뒤, 하나로 묶인 서버를 띄운다.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 12)) {
  console.error(`naver 플러그인은 Node.js 20.12 이상이 필요합니다 (현재 ${process.version}).`);
  process.exit(1);
}
const env = { ...process.env };
if (env.HTTPS_PROXY || env.https_proxy) env.NODE_USE_ENV_PROXY = '1';
const server = fileURLToPath(new URL('./server.mjs', import.meta.url));
const child = spawn(process.execPath, ['--no-warnings', server], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
