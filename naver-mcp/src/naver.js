// 네이버 API 클라이언트 모음. 각 함수는 필요한 환경변수가 없으면 설정 방법을 알려주는 오류를 던진다.
import bcrypt from 'bcryptjs';

const OPENAPI = 'https://openapi.naver.com'; // 카페 글쓰기
const HUB = 'https://naverapihub.apigw.ntruss.com'; // 검색·검색어 트렌드 (NAVER API HUB)
const COMMERCE = 'https://api.commerce.naver.com/external';
const MAPS = 'https://maps.apigw.ntruss.com';

export class ConfigError extends Error {}

function need(env, names, what) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    throw new ConfigError(
      `${what} 기능을 쓰려면 환경변수 ${missing.join(', ')} 가 필요합니다. naver-mcp/README.md 의 "키 발급" 항목을 참고하세요.`,
    );
  }
}

async function request(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`네이버 API 오류 ${res.status} (${new URL(url).pathname}): ${detail.slice(0, 500)}`);
  }
  return body;
}

const stripTags = (s) =>
  typeof s === 'string'
    ? s.replace(/<\/?b>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : s;

// ───────── 검색 / 데이터랩 ─────────

export const SEARCH_TYPES = ['news', 'blog', 'cafearticle', 'local', 'webkr', 'kin', 'encyc', 'image'];

function hubHeaders(env) {
  // 클라우드 세션에서는 키 값을 환경에 두지 않고 프록시가 헤더에 넣어 준다. 그때는 자리표시 값만 보낸다.
  const viaProxy = Boolean(env.HTTPS_PROXY || env.https_proxy);
  need(env, viaProxy ? ['NAVER_HUB_KEY_ID'] : ['NAVER_HUB_KEY_ID', 'NAVER_HUB_KEY'], '검색');
  return { 'X-NCP-APIGW-API-KEY-ID': env.NAVER_HUB_KEY_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_HUB_KEY || 'set-by-proxy' };
}

export async function search(env, { type, query, display = 10, start = 1, sort }) {
  const headers = hubHeaders(env);
  const qs = new URLSearchParams({ query, display: String(display), start: String(start) });
  if (sort) qs.set('sort', sort);
  const data = await request(`${HUB}/search/v1/${type}?${qs}`, { headers });
  return {
    total: data.total,
    start: data.start,
    items: (data.items ?? []).map((item) => {
      const out = {};
      for (const [k, v] of Object.entries(item)) out[k] = stripTags(v);
      // 지역 검색 좌표는 WGS84 경위도에 1e7 을 곱한 정수로 내려온다.
      if (type === 'local' && item.mapx && item.mapy) {
        out.lng = Number(item.mapx) / 1e7;
        out.lat = Number(item.mapy) / 1e7;
      }
      return out;
    }),
  };
}

export async function searchTrend(env, { startDate, endDate, timeUnit, keywordGroups, device, gender, ages }) {
  const headers = { ...hubHeaders(env), 'Content-Type': 'application/json' };
  const body = { startDate, endDate, timeUnit, keywordGroups };
  if (device) body.device = device;
  if (gender) body.gender = gender;
  if (ages?.length) body.ages = ages;
  return request(`${HUB}/search-trend/v1/search`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export async function shoppingInsight(env, { startDate, endDate, timeUnit, categories, keywordCategory, keywords, device, gender, ages }) {
  const headers = { ...hubHeaders(env), 'Content-Type': 'application/json' };
  const body = { startDate, endDate, timeUnit };
  if (device) body.device = device;
  if (gender) body.gender = gender;
  if (ages?.length) body.ages = ages;
  let path;
  if (keywords?.length) {
    // 한 분야 안에서 키워드별 클릭 추이
    if (!keywordCategory) throw new Error('keywords 를 쓰려면 keywordCategory(분야 ID)가 필요합니다.');
    path = '/shopping/v1/category/keywords';
    body.category = keywordCategory;
    body.keyword = keywords.map((k) => ({ name: k, param: [k] }));
  } else {
    // 분야별 클릭 추이
    if (!categories?.length) throw new Error('categories 또는 keywords 중 하나가 필요합니다.');
    path = '/shopping/v1/categories';
    body.category = categories.map((c) => ({ name: c.name, param: [c.id] }));
  }
  return request(`${HUB}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

// ───────── 카페 글쓰기 (네이버 로그인 OAuth 토큰) ─────────

let cachedUserToken = null;

async function refreshUserToken(env) {
  need(env, ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_REFRESH_TOKEN'], '카페 토큰 갱신');
  const qs = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.NAVER_CLIENT_ID,
    client_secret: env.NAVER_CLIENT_SECRET,
    refresh_token: env.NAVER_REFRESH_TOKEN,
  });
  const data = await request(`https://nid.naver.com/oauth2.0/token?${qs}`);
  if (!data?.access_token) throw new Error(`토큰 갱신 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function cafePost(env, { clubId, menuId, subject, content }) {
  if (!env.NAVER_ACCESS_TOKEN && !env.NAVER_REFRESH_TOKEN) {
    throw new ConfigError('카페 글쓰기에는 네이버 로그인 토큰이 필요합니다. naver-mcp 폴더에서 `npm run auth` 를 실행해 발급받으세요.');
  }
  const url = `${OPENAPI}/v1/cafe/${clubId}/menu/${menuId}/articles`;
  // 카페 API 는 값이 한 번 더 URL 인코딩된 형태를 요구한다(공식 예제 기준).
  const body = new URLSearchParams({ subject: encodeURIComponent(subject), content: encodeURIComponent(content) });
  const send = (token) =>
    fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });

  let token = cachedUserToken ?? env.NAVER_ACCESS_TOKEN ?? (cachedUserToken = await refreshUserToken(env));
  let res = await send(token);
  if (res.status === 401 && env.NAVER_REFRESH_TOKEN) {
    token = cachedUserToken = await refreshUserToken(env);
    res = await send(token);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`카페 글쓰기 실패 ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

// ───────── 스마트스토어 (커머스 API) ─────────

let commerceToken = null; // { value, expiresAt }

export function commerceSignature(clientId, clientSecret, timestamp) {
  // 전자서명: bcrypt(`${clientId}_${timestamp}`, salt=clientSecret) 을 base64 인코딩
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, 'utf-8').toString('base64');
}

async function commerceAuth(env) {
  need(env, ['NAVER_COMMERCE_CLIENT_ID', 'NAVER_COMMERCE_CLIENT_SECRET'], '스마트스토어');
  if (commerceToken && commerceToken.expiresAt > Date.now() + 60_000) return commerceToken.value;
  const timestamp = Date.now();
  const body = new URLSearchParams({
    client_id: env.NAVER_COMMERCE_CLIENT_ID,
    timestamp: String(timestamp),
    client_secret_sign: commerceSignature(env.NAVER_COMMERCE_CLIENT_ID, env.NAVER_COMMERCE_CLIENT_SECRET, timestamp),
    grant_type: 'client_credentials',
    type: 'SELF',
  });
  const data = await request(`${COMMERCE}/v1/oauth2/token`, { method: 'POST', body });
  commerceToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 0) * 1000 };
  return commerceToken.value;
}

async function commerce(env, path, { method = 'GET', query, json } = {}) {
  const token = await commerceAuth(env);
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const headers = { Authorization: `Bearer ${token}` };
  if (json) headers['Content-Type'] = 'application/json';
  return request(`${COMMERCE}${path}${qs}`, { method, headers, body: json ? JSON.stringify(json) : undefined });
}

export function commerceProducts(env, { page = 1, size = 20, statusTypes, searchKeyword }) {
  const json = { page, size };
  if (statusTypes?.length) json.productStatusTypes = statusTypes;
  if (searchKeyword) {
    json.searchKeywordType = 'PRODUCT_NAME';
    json.productName = searchKeyword;
  }
  return commerce(env, '/v1/products/search', { method: 'POST', json });
}

export function commerceChangedOrders(env, { lastChangedFrom, lastChangedTo, lastChangedType }) {
  const query = { lastChangedFrom };
  if (lastChangedTo) query.lastChangedTo = lastChangedTo;
  if (lastChangedType) query.lastChangedType = lastChangedType;
  return commerce(env, '/v1/pay-order/seller/product-orders/last-changed-statuses', { query });
}

export function commerceOrderDetails(env, { productOrderIds }) {
  return commerce(env, '/v1/pay-order/seller/product-orders/query', { method: 'POST', json: { productOrderIds } });
}

// ───────── 지도 (네이버 클라우드 플랫폼 Maps) ─────────

function mapsHeaders(env) {
  need(env, ['NCP_MAPS_KEY_ID', 'NCP_MAPS_KEY'], '지도');
  return { 'x-ncp-apigw-api-key-id': env.NCP_MAPS_KEY_ID, 'x-ncp-apigw-api-key': env.NCP_MAPS_KEY, Accept: 'application/json' };
}

export async function geocode(env, { address }) {
  const data = await request(`${MAPS}/map-geocode/v2/geocode?${new URLSearchParams({ query: address })}`, { headers: mapsHeaders(env) });
  return (data.addresses ?? []).map((a) => ({
    roadAddress: a.roadAddress,
    jibunAddress: a.jibunAddress,
    lng: Number(a.x),
    lat: Number(a.y),
  }));
}

export async function reverseGeocode(env, { lat, lng }) {
  const qs = new URLSearchParams({ coords: `${lng},${lat}`, output: 'json', orders: 'roadaddr,addr' });
  const data = await request(`${MAPS}/map-reversegeocode/v2/gc?${qs}`, { headers: mapsHeaders(env) });
  return (data.results ?? []).map((r) => ({
    type: r.name,
    address: [r.region?.area1?.name, r.region?.area2?.name, r.region?.area3?.name, r.region?.area4?.name, r.land?.name, r.land?.number1, r.land?.number2 && `-${r.land.number2}`]
      .filter(Boolean)
      .join(' ')
      .replace(' -', '-'),
    building: r.land?.addition0?.value || undefined,
  }));
}

export async function directions(env, { start, goal, option = 'trafast' }) {
  const qs = new URLSearchParams({ start: `${start.lng},${start.lat}`, goal: `${goal.lng},${goal.lat}`, option });
  const data = await request(`${MAPS}/map-direction/v1/driving?${qs}`, { headers: mapsHeaders(env) });
  const route = data.route?.[option]?.[0];
  if (!route) return { message: data.message ?? '경로를 찾지 못했습니다.', code: data.code };
  const s = route.summary;
  return {
    distanceKm: Math.round(s.distance / 100) / 10,
    durationMin: Math.round(s.duration / 60000),
    tollFare: s.tollFare,
    taxiFare: s.taxiFare,
    fuelPrice: s.fuelPrice,
    guide: (route.guide ?? []).map((g) => g.instructions),
  };
}
