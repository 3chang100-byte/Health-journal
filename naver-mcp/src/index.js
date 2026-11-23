#!/usr/bin/env node
// 실행기: 의존성이 없으면 설치하고, 프록시 환경(클라우드 세션)에서는 Node fetch 가 프록시를 쓰도록 켠 뒤 서버를 띄운다.
import { existsSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (!existsSync(`${root}node_modules/@modelcontextprotocol`)) {
  // MCP 는 stdout 을 통신에 쓰므로 설치 로그는 stderr 로만 보낸다.
  execSync('npm ci --no-audit --no-fund', { cwd: root, stdio: ['ignore', 2, 2] });
}
const env = { ...process.env };
if (env.HTTPS_PROXY || env.https_proxy) env.NODE_USE_ENV_PROXY = '1';
const child = spawn(process.execPath, ['--no-warnings', `${root}src/server.js`], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
