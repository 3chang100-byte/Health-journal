#!/usr/bin/env node
// Claude 에서 네이버를 다루는 MCP 서버 (stdio).
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as naver from './naver.js';
import { blogDraft } from './blog.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
// .env 는 호출할 때마다 다시 읽어서, 키를 넣은 뒤 서버를 재시작하지 않아도 바로 반영되게 한다.
const loadEnv = () => ({ ...process.env, ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}) });
const env = new Proxy({}, { get: (_, key) => loadEnv()[key] });

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
      '네이버 검색 결과를 가져옵니다. type: news(뉴스) blog(블로그) cafearticle(카페글) local(지역·플레이스, 결과에 lat/lng 포함) webkr(웹문서) kin(지식iN) encyc(백과사전) image(이미지). 쇼핑·책·전문자료 검색은 네이버가 종료해 지원하지 않습니다.',
    inputSchema: {
      type: z.enum(naver.SEARCH_TYPES),
      query: z.string().min(1).describe('검색어'),
      display: z.number().int().min(1).max(100).default(10).describe('결과 개수 (local 은 최대 5)'),
      start: z.number().int().min(1).max(1000).default(1).describe('시작 위치'),
      sort: z
        .enum(['sim', 'date', 'random', 'comment'])
        .optional()
        .describe('sim=정확도, date=최신순. local 은 random(정확도)/comment(리뷰순)'),
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
  'naver_shopping_insight',
  {
    title: '네이버 쇼핑인사이트',
    description:
      '네이버 쇼핑의 클릭 추이(상대값, 최대 100)를 조회합니다. categories 를 주면 분야별 추이를, keywordCategory + keywords 를 주면 그 분야 안의 키워드별 추이를 반환합니다. 1차 분야 ID: 50000000 패션의류, 50000001 패션잡화, 50000002 화장품/미용, 50000003 디지털/가전, 50000004 가구/인테리어, 50000005 출산/육아, 50000006 식품, 50000007 스포츠/레저, 50000008 생활/건강, 50000009 여가/생활편의.',
    inputSchema: {
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('yyyy-mm-dd (2017-08-01 이후)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timeUnit: z.enum(['date', 'week', 'month']).default('week'),
      categories: z
        .array(z.object({ name: z.string(), id: z.string().regex(/^\d+$/) }))
        .max(3)
        .optional()
        .describe('분야별 비교 (최대 3개)'),
      keywordCategory: z.string().regex(/^\d+$/).optional().describe('키워드 추이를 볼 분야 ID'),
      keywords: z.array(z.string()).max(5).optional().describe('키워드별 비교 (최대 5개)'),
      device: z.enum(['pc', 'mo']).optional(),
      gender: z.enum(['m', 'f']).optional(),
      ages: z.array(z.enum(['10', '20', '30', '40', '50', '60'])).optional().describe('연령대'),
    },
    annotations: readOnly,
  },
  run((a) => naver.shoppingInsight(env, a)),
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
  'naver_blog_draft',
  {
    title: '네이버 블로그 글 입력 (임시저장)',
    description:
      '사용자 PC 에 전용 브라우저 창을 열어 네이버 블로그 에디터에 제목과 본문을 입력하고 임시저장합니다. 발행은 하지 않으며, 사용자가 창에서 확인 후 직접 발행합니다. 처음에는 사용자가 그 창에서 네이버에 직접 로그인해야 합니다(status=login_required 가 오면 안내 후 다시 호출). content 는 일반 텍스트이며 줄바꿈이 문단이 됩니다(마크다운·HTML 기호는 그대로 입력되므로 쓰지 마세요). 하루 한두 편 수준의 개인 글쓰기용이며 대량·반복 게시에 쓰지 마세요.',
    inputSchema: {
      title: z.string().min(1).max(100).describe('글 제목'),
      content: z.string().min(1).describe('본문 (일반 텍스트)'),
      tags: z.array(z.string()).max(30).optional().describe('추천 태그 — 입력하지 않고 사용자에게 안내만 합니다'),
      saveDraft: z.boolean().default(true).describe('입력 후 임시저장 버튼을 누를지 여부'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  run((a) => blogDraft(env, a)),
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
