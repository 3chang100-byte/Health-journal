#!/usr/bin/env node
// 카페 글쓰기용 네이버 로그인 토큰 발급 도우미.
// 사전 준비: developers.naver.com 애플리케이션의 Callback URL 에 http://localhost:8787/callback 등록.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { NAVER_CLIENT_ID: id, NAVER_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('.env 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 를 먼저 채워주세요.');
  process.exit(1);
}

const PORT = 8787;
const redirect = `http://localhost:${PORT}/callback`;
const state = randomBytes(16).toString('hex');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (url.searchParams.get('state') !== state) return res.writeHead(400).end('state 불일치');
  const qs = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: id,
    client_secret: secret,
    code: url.searchParams.get('code') ?? '',
    state,
  });
  const token = await (await fetch(`https://nid.naver.com/oauth2.0/token?${qs}`)).json();
  if (!token.access_token) {
    res.writeHead(500).end('토큰 발급 실패. 터미널을 확인하세요.');
    console.error('토큰 발급 실패:', token);
  } else {
    res.end('완료되었습니다. 터미널로 돌아가세요.');
    console.log('\n아래 두 줄을 naver-mcp/.env 에 넣으세요 (다른 곳에 공유하지 마세요):\n');
    console.log(`NAVER_ACCESS_TOKEN=${token.access_token}`);
    console.log(`NAVER_REFRESH_TOKEN=${token.refresh_token}`);
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  const qs = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: redirect, state });
  console.log(`브라우저에서 아래 주소를 열어 네이버 로그인을 완료하세요:\n\nhttps://nid.naver.com/oauth2.0/authorize?${qs}\n`);
});
