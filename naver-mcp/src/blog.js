// 네이버 블로그 글 입력 — AI 브라우저(Aside 등)와 같은 방식.
// 공식 글쓰기 API 가 없으므로, 사용자가 직접 로그인해 둔 전용 브라우저 창에서 에디터에 제목·본문을 입력하고
// 임시저장까지만 한다. 발행 버튼은 사용자가 화면을 확인하고 직접 누른다.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from './naver.js';

const WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver';
const TITLE = '.se-title-text';
const BODY = '.se-component.se-text .se-text-paragraph';

let context = null;

async function getContext(env) {
  if (context) return context;
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new ConfigError('이 설치에는 브라우저 자동화 모듈(Playwright)이 없어 블로그 글 입력을 쓸 수 없습니다. 내 PC 에서 저장소의 naver-mcp 를 `npm install` 로 설치해 실행하면 쓸 수 있습니다.');
  }
  const profile = env.NAVER_MCP_PROFILE_DIR || join(homedir(), '.naver-mcp', 'browser-profile');
  const options = { headless: env.NAVER_MCP_HEADLESS === '1', viewport: null };
  try {
    // 설치된 크롬을 우선 사용하고, 없으면 Playwright 의 Chromium 을 쓴다.
    context = await chromium.launchPersistentContext(profile, { ...options, channel: 'chrome' });
  } catch {
    try {
      context = await chromium.launchPersistentContext(profile, options);
    } catch (err) {
      throw new ConfigError(`브라우저를 열지 못했습니다. 크롬을 설치하거나 \`npx playwright install chromium\` 을 실행하세요. (${err.message.split('\n')[0]})`);
    }
  }
  context.on('close', () => (context = null));
  return context;
}

async function findEditorFrame(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (/nid\.naver\.com/.test(page.url())) return null; // 로그인 화면으로 넘어감
    for (const frame of page.frames()) {
      if (await frame.locator(TITLE).count().catch(() => 0)) return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('블로그 에디터를 찾지 못했습니다. 네이버 에디터 화면 구조가 바뀌었을 수 있습니다. 열린 창의 상태를 확인하세요.');
}

async function dismissPopups(frame) {
  // "작성 중인 글이 있습니다" 복원 팝업은 취소, 도움말 패널은 닫는다. 없으면 그냥 지나간다.
  for (const sel of ['.se-popup-button-cancel', '.se-help-panel-close-button']) {
    const el = frame.locator(sel).first();
    if (await el.isVisible().catch(() => false)) await el.click().catch(() => {});
  }
}

export async function blogDraft(env, { title, content, tags = [], saveDraft = true }) {
  const ctx = await getContext(env);
  const page = await ctx.newPage();
  await page.goto(env.NAVER_BLOG_WRITE_URL || WRITE_URL, { waitUntil: 'domcontentloaded' });

  const frame = await findEditorFrame(page, 30_000);
  if (!frame) {
    return {
      status: 'login_required',
      message: '열린 브라우저 창에서 네이버에 직접 로그인해 주세요(로그인 상태 유지 권장). 로그인은 이 전용 창에 저장되어 다음부터는 묻지 않습니다. 로그인을 마친 뒤 같은 요청을 다시 실행하세요.',
    };
  }
  await dismissPopups(frame);

  await frame.locator(TITLE).first().click();
  await page.keyboard.type(title, { delay: 15 });

  await frame.locator(BODY).first().click();
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  for (const [i, line] of lines.entries()) {
    if (line) await page.keyboard.type(line, { delay: 5 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }

  let saved = false;
  if (saveDraft) {
    const save = frame.getByRole('button', { name: /^저장/ }).first();
    if (await save.isVisible().catch(() => false)) {
      await save.click();
      await page.waitForTimeout(1500);
      saved = true;
    }
  }

  return {
    status: saved ? 'draft_saved' : 'filled',
    message:
      (saved ? '제목과 본문을 입력하고 임시저장했습니다. ' : '제목과 본문을 입력했습니다(임시저장 버튼은 누르지 못했습니다). ') +
      '창은 열어 두었으니 내용·사진·카테고리를 확인한 뒤 발행 버튼을 직접 눌러 주세요.',
    suggestedTags: tags,
  };
}
