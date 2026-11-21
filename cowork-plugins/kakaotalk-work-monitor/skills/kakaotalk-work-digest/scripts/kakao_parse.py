#!/usr/bin/env python3
"""카카오톡 대화 내보내기 파일 파서.

지원 형식
  - PC(Windows) .txt   : [이름] [오전 10:23] 내용
  - Mac .csv           : Date,User,Message
  - Android .txt       : 2024년 1월 15일 오전 10:23, 이름 : 내용
  - iOS .txt           : 2024. 1. 15. 오전 10:23, 이름 : 내용
  - 위 파일이 들어 있는 .zip, 이 스크립트가 만든 보관함(.jsonl)

사용 예
  kakao_parse.py <파일|폴더>... --stats
  kakao_parse.py <폴더> --days 7
  kakao_parse.py <폴더> --since 2024-01-01 --until 2024-01-31 --room 영업
  kakao_parse.py <폴더> --keyword 회의 --keyword 미팅 --context 3
  kakao_parse.py <폴더> --archive <보관함.jsonl>      # 중복 없이 누적 저장
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta

WEEKDAYS = "월화수목금토일"

RE_TITLE = re.compile(r"^(.*?)\s*님과 카카오톡 대화\s*$")
RE_TITLE_EN = re.compile(r"^(?:KakaoTalk Chats with|Talk with)\s+(.*?)\s*$", re.I)
RE_PC_DATE = re.compile(r"^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*-{3,}\s*$")
RE_PC_MSG = re.compile(r"^\[(.+?)\] \[([^\]]{3,12})\] (.*)$")
RE_MOBILE = re.compile(
    r"^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)\s*"
    r"(?:(오전|오후|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM))?"
    r"(?:,\s*(.*))?$"
)
RE_TIME = re.compile(r"^(?:(오전|오후|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$", re.I)
RE_SAVED = re.compile(r"^(저장한 날짜|Date Saved)\s*:")


def to24(hour, ampm):
    if not ampm:
        return hour
    pm = ampm.upper() in ("오후", "PM")
    if pm and hour < 12:
        return hour + 12
    if not pm and hour == 12:
        return 0
    return hour


def decode(raw):
    for enc in ("utf-8-sig", "utf-16", "cp949"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def room_from_filename(name):
    base = os.path.splitext(os.path.basename(name))[0]
    base = re.sub(r"^KakaoTalk_Chat_", "", base)
    base = re.sub(r"^(KakaoTalk_|KakaoTalkChats|Talk_)", "", base)
    base = re.sub(r"[_-]?\d{4}[-.]?\d{1,2}[-.]?\d{1,2}[-_. ]?[\d\-_.: ]*$", "", base)
    base = base.strip("_- ")
    if not re.search(r"[^\W\d_]", base):  # 이름에 글자가 없으면(날짜뿐이면) 상위 폴더 이름 사용
        parent = os.path.basename(os.path.dirname(os.path.abspath(name)))
        base = parent or os.path.splitext(os.path.basename(name))[0]
    return base


def parse_txt(text, fname):
    lines = text.splitlines()
    room = None
    for line in lines[:3]:
        m = RE_TITLE.match(line.strip()) or RE_TITLE_EN.match(line.strip())
        if m:
            room = re.sub(r"\s+\d+$", "", m.group(1)).strip()
            break
    room = room or room_from_filename(fname)

    msgs, cur_date, cur = [], None, None
    for line in lines:
        s = line.rstrip("\r")
        if RE_SAVED.match(s) or RE_TITLE.match(s.strip()):
            continue
        m = RE_PC_DATE.match(s)
        if m:
            cur_date = tuple(int(x) for x in m.groups())
            cur = None
            continue
        m = RE_PC_MSG.match(s)
        if m and cur_date:
            t = RE_TIME.match(m.group(2).strip())
            if t:
                hour = to24(int(t.group(2)), t.group(1) or t.group(4))
                ts = datetime(*cur_date, hour, int(t.group(3)))
                cur = {"room": room, "ts": ts, "sender": m.group(1), "text": m.group(3)}
                msgs.append(cur)
                continue
        m = RE_MOBILE.match(s)
        if m:
            y, mo, d, ap1, hh, mm, ap2, rest = m.groups()
            sender, sep, body = (rest or "").partition(" : ")
            if not sep:  # 날짜 구분선 또는 입장/퇴장 같은 시스템 줄
                cur = None
                continue
            try:
                ts = datetime(int(y), int(mo), int(d), to24(int(hh), ap1 or ap2), int(mm))
            except ValueError:
                ts = None
            if ts:
                cur = {"room": room, "ts": ts, "sender": sender, "text": body}
                msgs.append(cur)
                continue
        if cur is not None:  # 여러 줄 메시지의 이어지는 줄
            cur["text"] += "\n" + s
    for m in msgs:
        m["text"] = m["text"].strip()
    return msgs


def parse_csv(text, fname):
    room = room_from_filename(fname)
    msgs = []
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if len(row) < 3:
            continue
        try:
            ts = datetime.strptime(row[0].strip(), "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue  # 헤더 등
        msgs.append({"room": room, "ts": ts, "sender": row[1], "text": ",".join(row[2:]).strip()})
    return msgs


def parse_jsonl(text):
    msgs = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
            o["ts"] = datetime.fromisoformat(o["ts"])
            msgs.append(o)
        except (ValueError, KeyError):
            continue
    return msgs


def parse_blob(raw, fname):
    low = fname.lower()
    text = decode(raw)
    if low.endswith(".jsonl"):
        return parse_jsonl(text)
    if low.endswith(".csv"):
        return parse_csv(text, fname)
    return parse_txt(text, fname)


def collect(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, names in os.walk(p):
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for n in sorted(names):
                    if n.lower().endswith((".txt", ".csv", ".zip")):
                        files.append(os.path.join(root, n))
        elif os.path.exists(p):
            files.append(p)
        else:
            print(f"[경고] 찾을 수 없음: {p}", file=sys.stderr)
    return files


def load(paths, room_override=None):
    msgs = []
    for f in collect(paths):
        try:
            if f.lower().endswith(".zip"):
                with zipfile.ZipFile(f) as z:
                    for n in z.namelist():
                        if n.lower().endswith((".txt", ".csv")):
                            got = parse_blob(z.read(n), f if n.lower().startswith(("kakaotalkchats", "talk")) else n)
                            msgs.extend(got)
            else:
                with open(f, "rb") as fh:
                    got = parse_blob(fh.read(), f)
                if room_override and not f.lower().endswith(".jsonl"):
                    for m in got:
                        m["room"] = room_override
                msgs.extend(got)
                if not got:
                    print(f"[경고] 카카오톡 대화로 인식되지 않음: {f}", file=sys.stderr)
        except (OSError, zipfile.BadZipFile) as e:
            print(f"[경고] 읽기 실패 {f}: {e}", file=sys.stderr)
    seen, out = set(), []
    for m in msgs:
        key = (m["room"], m["ts"], m["sender"], m["text"])
        if key not in seen:
            seen.add(key)
            out.append(m)
    out.sort(key=lambda m: (m["ts"], m["room"]))
    return out


def parse_when(s, end=False):
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if fmt == "%Y-%m-%d" and end:
                dt += timedelta(days=1) - timedelta(seconds=1)
            return dt
        except ValueError:
            continue
    sys.exit(f"날짜 형식 오류: {s} (예: 2024-01-15 또는 '2024-01-15 09:00')")


def apply_filters(msgs, a):
    since = parse_when(a.since) if a.since else None
    until = parse_when(a.until, end=True) if a.until else None
    if a.days:
        since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=a.days - 1)
    out = []
    for m in msgs:
        if since and m["ts"] < since:
            continue
        if until and m["ts"] > until:
            continue
        if a.room and not any(r.lower() in m["room"].lower() for r in a.room):
            continue
        if a.sender and not any(s.lower() in m["sender"].lower() for s in a.sender):
            continue
        out.append(m)
    if a.keyword:
        kws = [k.lower() for k in a.keyword]
        keep = set()
        by_room = {}
        for i, m in enumerate(out):
            by_room.setdefault(m["room"], []).append(i)
        for idxs in by_room.values():
            for pos, i in enumerate(idxs):
                if any(k in out[i]["text"].lower() for k in kws):
                    lo, hi = max(0, pos - a.context), min(len(idxs), pos + a.context + 1)
                    keep.update(idxs[lo:hi])
        out = [m for i, m in enumerate(out) if i in keep]
    return out


def print_stats(msgs):
    if not msgs:
        print("대화 없음")
        return
    rooms = {}
    for m in msgs:
        r = rooms.setdefault(m["room"], {"n": 0, "first": m["ts"], "last": m["ts"], "who": {}})
        r["n"] += 1
        r["first"], r["last"] = min(r["first"], m["ts"]), max(r["last"], m["ts"])
        r["who"][m["sender"]] = r["who"].get(m["sender"], 0) + 1
    for name, r in sorted(rooms.items(), key=lambda kv: kv[1]["last"], reverse=True):
        top = sorted(r["who"].items(), key=lambda kv: -kv[1])[:8]
        print(f"- {name}: {r['n']}건, {r['first']:%Y-%m-%d %H:%M} ~ {r['last']:%Y-%m-%d %H:%M}, "
              f"참여자 {len(r['who'])}명 ({', '.join(f'{k} {v}' for k, v in top)})")


def print_text(msgs):
    room = day = None
    for m in sorted(msgs, key=lambda m: (m["room"], m["ts"])):
        if m["room"] != room:
            room, day = m["room"], None
            print(f"\n## {room}")
        d = m["ts"].date()
        if d != day:
            day = d
            print(f"\n### {d} ({WEEKDAYS[d.weekday()]})")
        body = m["text"].replace("\n", "\n      ")
        print(f"{m['ts']:%H:%M} {m['sender']}: {body}")


def dump(m):
    return json.dumps({**m, "ts": m["ts"].isoformat(timespec="minutes")}, ensure_ascii=False)


def main():
    p = argparse.ArgumentParser(description="카카오톡 대화 내보내기 파일 파서")
    p.add_argument("paths", nargs="+", help="내보내기 파일, 폴더, 또는 보관함(.jsonl)")
    p.add_argument("--since", help="이 시점부터 (YYYY-MM-DD 또는 'YYYY-MM-DD HH:MM')")
    p.add_argument("--until", help="이 시점까지")
    p.add_argument("--days", type=int, help="오늘 포함 최근 N일")
    p.add_argument("--room", action="append", help="대화방 이름 일부 (여러 번 지정 가능)")
    p.add_argument("--sender", action="append", help="보낸 사람 이름 일부")
    p.add_argument("--keyword", action="append", help="포함 단어 (여러 개면 하나라도 포함)")
    p.add_argument("--context", type=int, default=2, help="키워드 앞뒤로 함께 보여줄 메시지 수")
    p.add_argument("--room-name", help="파일에서 방 이름을 알 수 없을 때 직접 지정")
    p.add_argument("--format", choices=["text", "jsonl"], default="text")
    p.add_argument("--stats", action="store_true", help="대화방별 요약만 출력")
    p.add_argument("--archive", help="파싱한 전체 대화를 이 .jsonl 보관함에 중복 없이 누적")
    a = p.parse_args()

    msgs = load(a.paths, a.room_name)

    if a.archive:
        merged = load([a.archive]) if os.path.exists(a.archive) else []
        before = len(merged)
        seen = {(m["room"], m["ts"], m["sender"], m["text"]) for m in merged}
        for m in msgs:
            if (m["room"], m["ts"], m["sender"], m["text"]) not in seen:
                merged.append(m)
        merged.sort(key=lambda m: (m["ts"], m["room"]))
        os.makedirs(os.path.dirname(os.path.abspath(a.archive)), exist_ok=True)
        with open(a.archive, "w", encoding="utf-8") as fh:
            for m in merged:
                fh.write(dump(m) + "\n")
        print(f"[보관함] 새 메시지 {len(merged) - before}건 추가, 총 {len(merged)}건", file=sys.stderr)

    msgs = apply_filters(msgs, a)
    if a.stats:
        print_stats(msgs)
    elif a.format == "jsonl":
        for m in msgs:
            print(dump(m))
    else:
        print_text(msgs)
        print(f"\n(총 {len(msgs)}건)")


if __name__ == "__main__":
    main()
