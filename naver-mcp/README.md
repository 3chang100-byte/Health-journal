# naver-mcp

Claude에서 네이버를 다루는 MCP 서버입니다. 블로그 글 입력만 브라우저 창을 쓰고, 나머지는 네이버 공식 API를 사용합니다.

| 도구 | 하는 일 | 필요한 키 |
| --- | --- | --- |
| `naver_search` | 뉴스·블로그·쇼핑·카페글·지역(플레이스)·웹문서·지식iN 등 검색 | 검색 |
| `naver_search_trend` | 데이터랩 검색어 트렌드 | 검색 |
| `naver_cafe_post` | 내 계정으로 카페 게시판에 글쓰기 (미리보기 → 승인 후 게시) | 검색 + 로그인 토큰 |
| `naver_blog_draft` | 내 PC 의 전용 브라우저 창에서 블로그 에디터에 글을 입력하고 임시저장 (발행은 직접) | 없음 (창에서 직접 로그인) |
| `naver_store_products` | 스마트스토어 상품 목록 | 커머스 |
| `naver_store_changed_orders` | 상태가 바뀐 주문 조회 | 커머스 |
| `naver_store_order_details` | 주문 상세 | 커머스 |
| `naver_map_geocode` / `naver_map_reverse_geocode` | 주소 ↔ 좌표 | 지도 |
| `naver_map_directions` | 자동차 길찾기 요약 | 지도 |

키는 쓰려는 기능 것만 넣으면 됩니다. 키가 없는 도구는 호출 시 설정 안내를 돌려줍니다.

## 설치

```bash
cd naver-mcp
npm install
cp .env.example .env
```

`.env` 는 git 에 올라가지 않습니다. 키를 채팅에 붙여넣지 말고 이 파일에만 넣으세요.

## 키 발급

1. **검색·데이터랩** — [developers.naver.com/apps](https://developers.naver.com/apps) 에서 애플리케이션을 등록하고 사용 API 에 "검색", "데이터랩(검색어트렌드)" 를 추가 → `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
2. **카페 글쓰기** — 같은 애플리케이션에 "네이버 로그인" 과 "카페" 를 추가하고, Callback URL 에 `http://localhost:8787/callback` 을 등록한 뒤:
   ```bash
   npm run auth
   ```
   출력된 주소에서 로그인하면 `NAVER_ACCESS_TOKEN`, `NAVER_REFRESH_TOKEN` 이 터미널에 표시됩니다. 액세스 토큰이 만료되면 리프레시 토큰으로 자동 갱신합니다.
3. **스마트스토어** — [커머스API센터](https://apicenter.commerce.naver.com) 에서 애플리케이션을 등록 → `NAVER_COMMERCE_CLIENT_ID`, `NAVER_COMMERCE_CLIENT_SECRET`. 서버를 실행하는 PC 의 공인 IP 를 API 호출 IP 로 등록해야 합니다.
4. **지도** — [네이버 클라우드 플랫폼 콘솔](https://console.ncloud.com) 의 Maps 에서 Geocoding, Reverse Geocoding, Directions 5 를 선택해 애플리케이션 등록 → `NCP_MAPS_KEY_ID`, `NCP_MAPS_KEY`

## 블로그 글 입력 (`naver_blog_draft`)

네이버에는 블로그 글쓰기 API 가 없습니다. 그래서 Aside 같은 AI 브라우저와 같은 방식을 씁니다. 사용자가 직접 로그인해 둔 브라우저 창에서 에디터에 글을 입력하고, 발행은 사람이 확인하고 누릅니다.

1. Claude 에게 "○○ 주제로 블로그 글 써서 네이버 블로그에 임시저장해줘" 라고 요청합니다.
2. 처음에는 전용 브라우저 창이 열리고 네이버 로그인 화면이 나옵니다. **직접** 로그인합니다. 아이디·비밀번호는 서버가 다루지 않으며, 로그인 상태는 `~/.naver-mcp/browser-profile` 에만 남습니다.
3. 같은 요청을 다시 하면 제목과 본문이 입력되고 임시저장됩니다.
4. 열려 있는 창에서 사진·카테고리·태그를 손보고 발행 버튼을 직접 누릅니다.

크롬이 설치되어 있으면 그것을 쓰고, 없으면 한 번 `npx playwright install chromium` 을 실행하세요.

주의할 점:

- 네이버 이용약관은 사전 허락 없는 자동화 수단으로 게시물을 올리는 것을 금지합니다. 사람이 확인하고 발행하는 방식이 여기에 해당하는지 네이버가 밝힌 적은 없으므로 위험이 0 은 아닙니다. 하루 한두 편 수준으로만 쓰고, 대량·예약 반복 게시에는 쓰지 마세요.
- 자동 발행, 봇 탐지 우회 기능은 일부러 넣지 않았습니다.
- 본문은 일반 텍스트 문단만 입력합니다. 사진·표·서식은 창에서 직접 넣어야 합니다.
- 실제 네이버 에디터에서는 아직 검증하지 못했습니다(로그인 계정이 필요). 모의 에디터 화면으로만 테스트했으므로, 첫 실행에서 에디터를 못 찾으면 `src/blog.js` 의 선택자를 손봐야 합니다.

## Claude 에 연결

**Claude Code** — 이 저장소 루트의 `.mcp.json` 에 이미 등록되어 있습니다. 저장소에서 Claude Code 를 열고 서버 사용을 승인하면 됩니다.

**Claude 데스크톱 앱** — 설정 → 개발자 → 구성 편집에서 `claude_desktop_config.json` 에 추가한 뒤 앱을 다시 시작합니다.

```json
{
  "mcpServers": {
    "naver": {
      "command": "node",
      "args": ["/절대/경로/Health-journal/naver-mcp/src/index.js"]
    }
  }
}
```

이후 "네이버 뉴스에서 ○○ 최근 기사 찾아서 요약해줘", "어제부터 들어온 스마트스토어 주문 정리해줘" 처럼 말하면 됩니다.

## 알아둘 점

- **플레이스 리뷰·내 매장 관리**(스마트플레이스)도 공식 API 가 없어 빠져 있습니다. 장소 검색은 `naver_search` 의 `type=local` 을 씁니다.
- **스마트스토어 도구는 읽기 전용**입니다. 발주 확인·발송 처리·상품 수정 같은 쓰기 기능은 넣지 않았습니다.
- 실제 키 없이 모의 응답으로만 테스트했습니다(`npm test`). 카페 글쓰기의 인코딩 방식과 커머스·지도 API 의 응답 형태는 실제 키로 한 번 확인이 필요합니다.
- 이 서버는 내 PC 에서 도는 stdio 방식이라 claude.ai 웹/모바일 커넥터로는 바로 붙지 않습니다.
