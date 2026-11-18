// Design Ref: §1 화면 구성 ⑧만들어진 메시지 · ⑨글자 수·남은 횟수 · ⑩실패 안내 · ⑪복사/다시 만들기 버튼 (PLAN 작업 9·10·11·12번)
// 결과 영역만 그린다. 횟수를 세고 막을지 정하는 일은 부모(ExcuseApp)가 하고, 이 부품은 받은 값을 보여준다.
"use client";

import { useEffect, useRef, useState } from "react";

type ExcuseResultProps = {
  /** 만들어진 메시지. 아직 없으면 null */
  message: string | null;
  /** 실패했을 때 보여줄 안내 문구. 없으면 null */
  notice: string | null;
  /** "다시 만들기"로 새 메시지를 만드는 중인지. true면 버튼이 "만드는 중…"으로 바뀐다 */
  regenerating: boolean;
  /** "다시 만들기" 남은 횟수 (0~5) */
  remaining: number;
  /** "다시 만들기"를 막아야 하는지(만드는 중·횟수 소진·입력이 바뀜). true면 버튼이 눌리지 않는다 */
  regenerateDisabled: boolean;
  /** 버튼이 막힌 이유 등 알려줄 안내 문구. 없으면 null */
  hint: string | null;
  /** "다시 만들기" 버튼을 눌렀을 때 */
  onRegenerate: () => void;
};

// 복사 결과를 얼마나 보여줄지(밀리초). 성공은 2초(DESIGN 1장), 실패는 안내를 읽을 시간을 더 준다.
const COPIED_SHOWN_MS = 2_000;
const FAILED_SHOWN_MS = 4_000;

// 복사·다시 만들기 버튼 공통 모양 (Fernhollow 스타일): 크림색 테두리 알약. 올리면 크림색으로 채워진다. 막히면 흐려진다.
const secondaryButtonClass =
  "rounded-full border border-cream/45 px-6 py-3 text-[15px] text-cream transition-colors hover:bg-cream hover:text-ink " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-cream";

export default function ExcuseResult({
  message,
  notice,
  regenerating,
  remaining,
  regenerateDisabled,
  hint,
  onRegenerate,
}: ExcuseResultProps) {
  // 어느 메시지를 복사했는지와 결과(성공/실패). 다른 메시지가 나오면 저절로 "복사 전"으로 돌아간다.
  const [copyResult, setCopyResult] = useState<{
    message: string;
    status: "copied" | "failed";
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 화면이 사라질 때 남은 타이머를 정리한다
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copyStatus =
    copyResult !== null && copyResult.message === message ? copyResult.status : "idle";

  async function handleCopy() {
    if (message === null) return;
    let status: "copied" | "failed";
    try {
      // 브라우저에 원래 있는 클립보드 기능을 쓴다 (추가 설치 없음)
      await navigator.clipboard.writeText(message);
      status = "copied";
    } catch {
      // 권한이 없거나 클립보드를 쓸 수 없는 환경
      status = "failed";
    }
    setCopyResult({ message, status });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setCopyResult(null),
      status === "copied" ? COPIED_SHOWN_MS : FAILED_SHOWN_MS,
    );
  }

  // 처음 들어왔을 때는 결과 영역 전체를 숨긴다. (DESIGN 1장 화면 상태표)
  if (message === null && notice === null) return null;

  return (
    // aria-live: 결과나 안내가 나타나면 화면 낭독 프로그램이 읽어 준다
    <section
      aria-live="polite"
      className="flex flex-col gap-3 border-t border-cream/15 pt-7"
    >
      {/* ⑧ 만들어진 메시지 */}
      {message !== null && (
        <>
          <p className="whitespace-pre-wrap rounded-2xl border border-cream/20 bg-cream/[0.06] p-5 text-lg leading-8 text-cream shadow-[0_0_40px_rgba(180,140,255,0.12)]">
            {message}
          </p>
          {/* ⑨ 글자 수(공백 포함, 줄바꿈 제외 — 서버 검사기와 같은 방법으로 센다) · 다시 만들기 남은 횟수 */}
          <p className="text-sm text-cream/55">
            {[...message.replace(/\r?\n/g, "")].length}자 · 다시 만들기 남은 횟수 {remaining}회
          </p>
          {/* 버튼이 막힌 이유: "상황을 새로 입력해 주세요" / "입력이 바뀌었어요…" */}
          {hint !== null && <p className="text-sm font-medium text-amber-300">{hint}</p>}

          {/* ⑪ 복사 · 다시 만들기 버튼 */}
          <div className="flex flex-wrap gap-3">
            {/* 복사: 한 번 누르면 메시지를 복사하고, 2초 동안 "복사됨"을 보여준다 */}
            <button
              type="button"
              onClick={handleCopy}
              className={secondaryButtonClass}
            >
              {copyStatus === "copied"
                ? "복사됨"
                : copyStatus === "failed"
                  ? "복사 실패"
                  : "복사"}
            </button>
            {/* 다시 만들기: 직전 사유와 다른 사유로 새 메시지를 만든다. 만드는 중에는 눌리지 않는다 */}
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              className={secondaryButtonClass}
            >
              {regenerating ? "만드는 중…" : "다시 만들기"}
            </button>
          </div>
          {copyStatus === "failed" && (
            <p role="alert" className="text-sm text-alert">
              복사하지 못했어요. 메시지를 직접 선택해서 복사해 주세요
            </p>
          )}
        </>
      )}

      {/* 실패 안내: 첫 생성이 실패하면 ⑧ 자리에 보인다 */}
      {notice !== null && (
        <p
          role="alert"
          className="rounded-2xl border border-alert/40 bg-alert/10 p-4 text-base text-alert"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
