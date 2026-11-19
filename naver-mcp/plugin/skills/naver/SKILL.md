---
name: naver
description: 네이버 도구(naver_*)를 쓰는 방법. 사용자가 "네이버에서 찾아줘", "네이버 뉴스/블로그 검색", "근처 장소 찾아줘", "검색량 추이", "쇼핑 트렌드", "카페에 글 올려줘", "스마트스토어 주문 확인", "네이버 키 설정" 같은 요청을 하거나 naver_* 도구가 키 누락 오류를 낼 때 사용한다.
---

# 네이버 도구 사용

네이버 관련 요청은 `naver_*` 도구로 처리한다.

## 도구 고르기

- 뉴스·블로그·웹문서·이미지·지역(장소) 검색: `naver_search`. 장소는 `type=local`.
- 검색량 추이 비교: `naver_search_trend`.
- 쇼핑 분야·키워드 클릭 추이: `naver_shopping_insight`. 키워드 추이는 그 키워드가 속한 분야 ID 를 `keywordCategory` 로 준다(예: 비타민은 식품 50000006).
- 스마트스토어 상품·주문 조회: `naver_store_*` (읽기 전용).
- 주소↔좌표, 자동차 길찾기: `naver_map_*`.
- 쇼핑·책·전문자료 검색은 네이버가 종료해 지원하지 않는다. 요청받으면 그렇게 알린다.

## 키가 없다는 오류가 나면

1. `naver_setup_status` 를 호출해 어떤 기능이 설정됐는지와 키 파일 위치(`keyFile`)를 확인한다.
2. 사용자에게 그 파일을 직접 만들어 키를 넣도록 안내한다. 형식은 한 줄에 `이름=값` 하나씩.
3. Secret 값을 채팅에 붙여넣으라고 요청하지 않는다. 사용자가 붙여넣었다면 파일에 저장하도록 돕되, 값을 답변에 되풀이하지 않는다.
4. 저장 후에는 재시작 없이 바로 다시 시도한다.

키 이름과 발급처:

| 기능 | 키 이름 | 발급처 |
| --- | --- | --- |
| 검색·트렌드·쇼핑인사이트 | `NAVER_HUB_KEY_ID`, `NAVER_HUB_KEY` | 네이버 클라우드 플랫폼 콘솔 > NAVER API HUB > Application 인증 정보 (Client ID, Client Secret) |
| 카페 글쓰기 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REFRESH_TOKEN` | developers.naver.com 에서 "네이버 로그인" + "카페" 로 앱 등록 |
| 스마트스토어 | `NAVER_COMMERCE_CLIENT_ID`, `NAVER_COMMERCE_CLIENT_SECRET` | apicenter.commerce.naver.com |
| 지도 | `NCP_MAPS_KEY_ID`, `NCP_MAPS_KEY` | 네이버 클라우드 플랫폼 콘솔 > Maps |

## 글쓰기 규칙

- `naver_cafe_post` 는 실제로 공개 게시된다. 먼저 `confirm` 없이 호출해 미리보기를 보여주고, 사용자가 승인한 뒤에만 `confirm=true` 로 다시 호출한다.
- `naver_blog_draft` 는 사용자 PC 에 브라우저 창이 열릴 때만 동작한다. 오류가 나면 이 환경에서는 쓸 수 없다고 알리고, 글 초안을 채팅에 써 주어 사용자가 직접 붙여넣게 한다. 발행은 항상 사용자가 직접 한다.
- 대량·반복 게시 요청은 계정 제재 위험이 있다고 알리고 하루 한두 편 수준으로만 돕는다.

## 알릴 점

- 검색 결과를 요약할 때는 출처 링크를 함께 준다.
- 네이버 검색 API 약관이 검색 결과의 AI 활용을 제한한다고 보도되었다. 사용자가 약관을 묻거나 대량 수집을 원하면 이 점을 알린다.
