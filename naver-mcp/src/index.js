#!/usr/bin/env node
// Claude 에서 네이버를 다루는 MCP 서버 (stdio).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as naver from './naver.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const env = process.env;

const server = new McpServer({ name: 'naver', version: '0.1.0' });

const reply = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const run = (fn) => async (args) => {
  try {
    return reply(await fn(args));
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
};
const readOnly = { readOnlyHint: true, openWorldHint: true };
const point = z.object({ lat: z.number().describe('위도'), lng: z.number().describe('경도') });

server.registerTool(
  'naver_search',
  {
    title: '네이버 검색',
    description:
      '네이버 검색 결과를 가져옵니다. type: news(뉴스) blog(블로그) shop(쇼핑) cafearticle(카페글) local(지역·플레이스, 결과에 lat/lng 포함) webkr(웹문서) kin(지식iN) book(책) encyc(백과사전) image(이미지) doc(전문자료).',
    inputSchema: {
      type: z.enum(naver.SEARCH_TYPES),
      query: z.string().min(1).describe('검색어'),
      display: z.number().int().min(1).max(100).default(10).describe('결과 개수 (local 은 최대 5)'),
      start: z.number().int().min(1).max(1000).default(1).describe('시작 위치'),
      sort: z
        .enum(['sim', 'date', 'asc', 'dsc', 'random', 'comment'])
        .optional()
        .describe('sim=정확도, date=최신순. shop 은 asc/dsc(가격순) 추가, local 은 random(정확도)/comment(리뷰순)'),
    },
    annotations: readOnly,
  },
  run((a) => naver.search(env, a)),
);

server.registerTool(
  'naver_search_trend',
  {
    title: '네이버 검색어 트렌드',
    description: '네이버 데이터랩 통합 검색어 트렌드. 기간 내 검색량의 상대값(최대 100)을 주제어 그룹별로 반환합니다.',
    inputSchema: {
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('yyyy-mm-dd (2016-01-01 이후)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timeUnit: z.enum(['date', 'week', 'month']).default('week'),
      keywordGroups: z
        .array(z.object({ groupName: z.string(), keywords: z.array(z.string()).min(1).max(20) }))
        .min(1)
        .max(5),
      device: z.enum(['pc', 'mo']).optional(),
      gender: z.enum(['m', 'f']).optional(),
      ages: z.array(z.string()).optional().describe('연령 코드 "1"(0-12) ~ "11"(60+)'),
    },
    annotations: readOnly,
  },
  run((a) => naver.searchTrend(env, a)),
);

server.registerTool(
  'naver_cafe_post',
  {
    title: '네이버 카페 글쓰기',
    description:
      '로그인한 내 계정으로 가입한 카페 게시판에 글을 올립니다. 실제로 공개 게시되므로, 먼저 confirm 없이 호출해 미리보기를 사용자에게 보여주고 사용자가 승인한 뒤에만 confirm=true 로 다시 호출하세요. content 는 HTML 을 쓸 수 있습니다.',
    inputSchema: {
      clubId: z.string().regex(/^\d+$/).describe('카페 고유 ID (숫자)'),
      menuId: z.string().regex(/^\d+$/).describe('게시판 ID (숫자)'),
      subject: z.string().min(1).describe('제목'),
      content: z.string().min(1).describe('본문'),
      confirm: z.boolean().default(false).describe('true 일 때만 실제 게시'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  run(async ({ confirm, ...post }) => {
    if (!confirm) return { preview: post, posted: false, next: '사용자 승인 후 confirm=true 로 다시 호출하면 게시됩니다.' };
    return { posted: true, result: await naver.cafePost(env, post) };
  }),
);

server.registerTool(
  'naver_store_products',
  {
    title: '스마트스토어 상품 목록',
    description: '내 스마트스토어의 상품 목록을 조회합니다 (읽기 전용).',
    inputSchema: {
      page: z.number().int().min(1).default(1),
      size: z.number().int().min(1).max(500).default(20),
      statusTypes: z
        .array(z.enum(['WAIT', 'SALE', 'OUTOFSTOCK', 'UNADMISSION', 'REJECTION', 'SUSPENSION', 'CLOSE', 'PROHIBITION']))
        .optional()
        .describe('판매 상태 필터'),
      searchKeyword: z.string().optional().describe('상품명 검색어'),
    },
    annotations: readOnly,
  },
  run((a) => naver.commerceProducts(env, a)),
);

server.registerTool(
  'naver_store_changed_orders',
  {
    title: '스마트스토어 변경 주문 조회',
    description:
      '지정한 시각 이후 상태가 바뀐 상품 주문 목록을 조회합니다 (조회 범위는 최대 24시간). 상세 내용은 naver_store_order_details 로 확인하세요.',
    inputSchema: {
      lastChangedFrom: z.string().describe('ISO 8601, 예: 2026-01-01T00:00:00.000+09:00'),
      lastChangedTo: z.string().optional(),
      lastChangedType: z
        .enum(['PAY_WAITING', 'PAYED', 'EXCHANGE_OPTION', 'DELIVERY_ADDRESS_CHANGED', 'GIFT_RECEIVED', 'CLAIM_REJECTED', 'DISPATCHED', 'CLAIM_REQUESTED', 'COLLECT_DONE', 'CLAIM_COMPLETED', 'PURCHASE_DECIDED'])
        .optional(),
    },
    annotations: readOnly,
  },
  run((a) => naver.commerceChangedOrders(env, a)),
);

server.registerTool(
  'naver_store_order_details',
  {
    title: '스마트스토어 주문 상세',
    description: '상품 주문 번호로 주문 상세(상품, 수량, 금액, 배송 상태 등)를 조회합니다. 구매자 개인정보가 포함될 수 있습니다.',
    inputSchema: { productOrderIds: z.array(z.string()).min(1).max(300) },
    annotations: readOnly,
  },
  run((a) => naver.commerceOrderDetails(env, a)),
);

server.registerTool(
  'naver_map_geocode',
  {
    title: '주소 → 좌표',
    description: '도로명/지번 주소를 좌표로 바꿉니다. 상호명 검색은 naver_search 의 type=local 을 쓰세요.',
    inputSchema: { address: z.string().min(1) },
    annotations: readOnly,
  },
  run((a) => naver.geocode(env, a)),
);

server.registerTool(
  'naver_map_reverse_geocode',
  {
    title: '좌표 → 주소',
    description: '좌표를 도로명/지번 주소로 바꿉니다.',
    inputSchema: point.shape,
    annotations: readOnly,
  },
  run((a) => naver.reverseGeocode(env, a)),
);

server.registerTool(
  'naver_map_directions',
  {
    title: '자동차 길찾기',
    description: '두 좌표 사이의 자동차 경로 요약(거리, 소요 시간, 통행료, 안내)을 반환합니다.',
    inputSchema: {
      start: point,
      goal: point,
      option: z
        .enum(['trafast', 'tracomfort', 'traoptimal', 'traavoidtoll', 'traavoidcaronly'])
        .default('trafast')
        .describe('trafast=실시간 빠른길, tracomfort=편한길, traoptimal=최적, traavoidtoll=무료 우선'),
    },
    annotations: readOnly,
  },
  run((a) => naver.directions(env, a)),
);

await server.connect(new StdioServerTransport());
