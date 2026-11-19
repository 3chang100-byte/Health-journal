# naver-mcp

Claude에서 네이버를 다루는 MCP 서버입니다. 블로그 글 입력만 브라우저 창을 쓰고, 나머지는 네이버 공식 API를 사용합니다.

| 도구 | 하는 일 | 필요한 키 |
| --- | --- | --- |
| `naver_setup_status` | 어떤 키가 설정됐는지, 키 파일을 어디에 둘지 확인 | 없음 |
| `naver_search` | 뉴스·블로그·카페글·지역(플레이스)·웹문서·지식iN·백과사전·이미지 검색 | API HUB |
| `naver_search_trend` | 검색어 트렌드 | API HUB |
| `naver_shopping_insight` | 쇼핑 분야별·키워드별 클릭 추이 | API HUB |
| `naver_cafe_post` | 내 계정으로 카페 게시판에 글쓰기 (미리보기 → 승인 후 게시) | 개발자센터 + 로그인 토큰 |
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

1. **검색·검색어 트렌드** — 2026년 7월부터 개발자센터가 아니라 네이버 클라우드 플랫폼의 NAVER API HUB 에서 발급합니다. [ncloud.com](https://www.ncloud.com) 가입(결제 카드 등록 필요) → 콘솔 → 전체 서비스 → 애플리케이션 서비스 → NAVER API HUB → 이용 신청 → Application 등록에서 검색 API 선택 → 인증 정보의 Client ID 를 `NAVER_HUB_KEY_ID`, Client Secret 을 `NAVER_HUB_KEY` 에 넣습니다.
2. **카페 글쓰기** — [developers.naver.com/apps](https://developers.naver.com/apps) 에서 사용 API 로 "네이버 로그인" 과 "카페" 를 골라 애플리케이션을 등록하고(`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`), Callback URL 에 `http://localhost:8787/callback` 을 등록한 뒤:
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

## 클라우드 세션(claude.ai/code)에서 쓰기

이 저장소로 클라우드 세션을 열면 `.mcp.json` 덕분에 서버가 자동으로 뜹니다. 설치도 첫 실행 때 스스로 하고, 세션의 네트워크 프록시도 자동으로 씁니다. 따로 실행할 명령은 없습니다.

- 키는 채팅에 붙여넣지 않습니다. API HUB 의 Client ID 처럼 비밀이 아닌 값은 `NAVER_HUB_KEY_ID` 로, Client Secret 은 Claude 가 띄우는 보안 입력 폼(네트워크 시크릿)으로 넣습니다. 클라우드 세션에서는 서버가 시크릿 없이 요청하고 프록시가 헤더를 채웁니다.
- `naver_blog_draft` 는 클라우드에서 쓸 수 없습니다. 클라우드 컨테이너에는 직접 로그인할 화면이 없기 때문입니다. 블로그 글 입력은 내 PC 에서 실행할 때만 됩니다.

## Cowork 플러그인

`plugin/` 은 Cowork 용 플러그인 템플릿입니다. 아래 명령으로 `dist/naver.plugin` 을 만들어 Cowork 에 설치합니다. 서버가 파일 하나로 묶여 들어가므로 설치 후 `npm install` 이 필요 없습니다.

```bash
bash scripts/build-plugin.sh
```

키는 홈 폴더의 `~/.naver-mcp/keys.env` 에 넣습니다. 정확한 위치는 Claude 에게 "네이버 연결 상태 확인해줘" 라고 하면 알려줍니다(`naver_setup_status`). 플러그인에는 브라우저 자동화 모듈이 없어 블로그 글 입력은 빠집니다.

## 알아둘 점

- **검색 API 약관 주의**: 2026년 9월 7일부터 검색 API 결과를 AI 에 입력하거나 답변 생성에 쓰는 것을 금지한다고 보도되었습니다. Claude 에서 검색 도구를 쓰는 것이 여기에 해당할 수 있으니, API HUB 약관을 직접 확인하고 판단하세요.
- 쇼핑·책·전문자료 검색은 네이버가 2026년 7월 31일 종료해 지원하지 않습니다.
- **플레이스 리뷰·내 매장 관리**(스마트플레이스)도 공식 API 가 없어 빠져 있습니다. 장소 검색은 `naver_search` 의 `type=local` 을 씁니다.
- **스마트스토어 도구는 읽기 전용**입니다. 발주 확인·발송 처리·상품 수정 같은 쓰기 기능은 넣지 않았습니다.
- 검색·검색어 트렌드·쇼핑인사이트는 실제 키로 동작을 확인했습니다. 카페·커머스·지도는 모의 응답으로만 테스트했으므로(`npm test`), 실제 키로 한 번 확인이 필요합니다.
- claude.ai 채팅(웹/모바일)의 커넥터로는 붙지 않습니다. Claude Code(내 PC 또는 클라우드 세션)와 Claude 데스크톱 앱에서 씁니다.
