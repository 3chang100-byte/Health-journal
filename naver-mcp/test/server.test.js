import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as naver from '../src/naver.js';

const keys = { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' };

function mockFetch(t, handler) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

test('search: 헤더·쿼리 전송, 태그 제거, 지역 좌표 변환', async (t) => {
  const calls = mockFetch(t, () => ({
    body: { total: 1, start: 1, items: [{ title: '<b>강남</b> 약국 &amp; 병원', mapx: '1270276000', mapy: '374979000' }] },
  }));
  const out = await naver.search(keys, { type: 'local', query: '강남 약국', display: 5 });
  assert.match(calls[0].url, /\/v1\/search\/local\.json\?query=%EA%B0%95%EB%82%A8\+%EC%95%BD%EA%B5%AD&display=5&start=1$/);
  assert.equal(calls[0].init.headers['X-Naver-Client-Id'], 'id');
  assert.deepEqual(out.items[0], { title: '강남 약국 & 병원', mapx: '1270276000', mapy: '374979000', lng: 127.0276, lat: 37.4979 });
});

test('키가 없으면 설정 안내 오류', async () => {
  await assert.rejects(() => naver.search({}, { type: 'news', query: 'x' }), /NAVER_CLIENT_ID, NAVER_CLIENT_SECRET/);
  await assert.rejects(() => naver.geocode({}, { address: 'x' }), /NCP_MAPS_KEY_ID/);
});

test('API 오류는 상태 코드와 함께 전달', async (t) => {
  mockFetch(t, () => ({ status: 401, body: { errorMessage: 'bad key' } }));
  await assert.rejects(() => naver.search(keys, { type: 'news', query: 'x' }), /401.*bad key/);
});

test('commerce: 서명 검증 가능, 토큰 재사용', async (t) => {
  const salt = bcrypt.genSaltSync(4);
  const sign = naver.commerceSignature('cid', salt, 1700000000000);
  assert.ok(bcrypt.compareSync('cid_1700000000000', Buffer.from(sign, 'base64').toString()));

  const calls = mockFetch(t, (url) =>
    url.endsWith('/oauth2/token') ? { body: { access_token: 'tok', expires_in: 10800 } } : { body: { contents: [] } },
  );
  const env = { NAVER_COMMERCE_CLIENT_ID: 'cid', NAVER_COMMERCE_CLIENT_SECRET: salt };
  await naver.commerceProducts(env, { searchKeyword: '비타민' });
  await naver.commerceOrderDetails(env, { productOrderIds: ['1'] });
  assert.equal(calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 1);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[1].init.body), { page: 1, size: 20, searchKeywordType: 'PRODUCT_NAME', productName: '비타민' });
});

test('cafePost: 401 이면 토큰 갱신 후 재시도', async (t) => {
  let posts = 0;
  const calls = mockFetch(t, (url) => {
    if (url.includes('nid.naver.com')) return { body: { access_token: 'fresh' } };
    return ++posts === 1 ? { status: 401, body: {} } : { body: { message: { result: { articleId: 7 } } } };
  });
  const out = await naver.cafePost(
    { ...keys, NAVER_ACCESS_TOKEN: 'old', NAVER_REFRESH_TOKEN: 'r' },
    { clubId: '1', menuId: '2', subject: '제목', content: '본문' },
  );
  assert.equal(out.message.result.articleId, 7);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer fresh');
});

test('directions: 요약 변환', async (t) => {
  mockFetch(t, () => ({
    body: { code: 0, route: { trafast: [{ summary: { distance: 12340, duration: 1500000, tollFare: 0, taxiFare: 15000, fuelPrice: 1800 }, guide: [{ instructions: '우회전' }] }] } },
  }));
  const out = await naver.directions({ NCP_MAPS_KEY_ID: 'a', NCP_MAPS_KEY: 'b' }, { start: { lat: 37.5, lng: 127 }, goal: { lat: 37.6, lng: 127.1 } });
  assert.deepEqual(out, { distanceKm: 12.3, durationMin: 25, tollFare: 0, taxiFare: 15000, fuelPrice: 1800, guide: ['우회전'] });
});

test('MCP 서버: 도구 목록, 키 없는 호출, 카페 미리보기', async () => {
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(NAVER_|NCP_)/.test(k)));
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/index.js'], env: cleanEnv });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((x) => x.name).sort(), [
      'naver_cafe_post',
      'naver_map_directions',
      'naver_map_geocode',
      'naver_map_reverse_geocode',
      'naver_search',
      'naver_search_trend',
      'naver_store_changed_orders',
      'naver_store_order_details',
      'naver_store_products',
    ]);
    const noKey = await client.callTool({ name: 'naver_search', arguments: { type: 'news', query: '건강' } });
    assert.equal(noKey.isError, true);
    assert.match(noKey.content[0].text, /NAVER_CLIENT_ID/);

    const preview = await client.callTool({ name: 'naver_cafe_post', arguments: { clubId: '1', menuId: '2', subject: 's', content: 'c' } });
    assert.equal(JSON.parse(preview.content[0].text).posted, false);
  } finally {
    await client.close();
  }
});
