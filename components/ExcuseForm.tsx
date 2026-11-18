// Design Ref: §1 화면 구성 ③교통수단 · ④늦는 시간 · ⑤입력 오류 안내 · ⑥상사와의 관계 · ⑦핑계 만들기 버튼
// (PLAN 작업 3번: 입력 칸 / 작업 4번: 안내 문구와 버튼)
// 입력 영역만 그린다. 값과 오류는 부모(ExcuseApp)가 들고 있고, 이 부품은 받은 것을 보여주고 바뀔 때 알리기만 한다.
"use client";

import {
  LIMITS,
  RELATIONS,
  TRANSPORTS,
  type Relation,
  type Transport,
} from "@/lib/constants";
import type { InputErrors } from "@/lib/validate";

type ExcuseFormProps = {
  /** 고른 교통수단. 아직 안 골랐으면 null */
  transport: Transport | null;
  /** 늦는 시간(분). 숫자인지 검사하기 전의 글자 그대로 받는다 */
  minutes: string;
  /** 고른 상사와의 관계. 아직 안 골랐으면 null */
  relation: Relation | null;
  /** 칸별 안내 문구. 지금 보여줄 것만 들어 있다 */
  errors: InputErrors;
  /** "핑계 만들기"로 메시지를 만드는 중인지. true면 버튼이 "만드는 중…"으로 바뀐다 */
  loading: boolean;
  /** 어떤 방법으로든 서버가 일하는 중인지("다시 만들기" 포함). true면 버튼이 눌리지 않는다 */
  disabled: boolean;
  onTransportChange: (value: Transport) => void;
  onMinutesChange: (value: string) => void;
  onRelationChange: (value: Relation) => void;
  /** "핑계 만들기" 버튼을 눌렀을 때 */
  onSubmit: () => void;
};

// 선택 칸(라벨) 공통 모양 (Fernhollow 스타일): 얇은 크림색 테두리의 알약. 골라지면 크림색으로 꽉 차고 글씨는 어두워진다.
const choiceBase =
  "cursor-pointer select-none rounded-full border border-cream/25 px-5 py-2.5 text-[15px] text-cream/85 transition-colors " +
  "hover:border-cream/60 hover:bg-cream/10 " +
  "has-checked:border-cream has-checked:bg-cream has-checked:text-ink " +
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream";

// 칸 제목: 작고 차분한 크림색
const legendClass = "mb-3 text-[13px] font-medium tracking-[0.08em] text-cream/60";

// ⑤ 입력 오류 안내: 어두운 배경에서 잘 읽히는 연한 분홍빛 빨강
const errorClass = "mt-2 text-sm text-alert";

export default function ExcuseForm({
  transport,
  minutes,
  relation,
  errors,
  loading,
  disabled,
  onTransportChange,
  onMinutesChange,
  onRelationChange,
  onSubmit,
}: ExcuseFormProps) {
  return (
    <form
      // 입력 검사는 브라우저 기본 검사 대신 우리가 직접 한다(validate.ts)
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-6"
    >
      {/* ③ 교통수단: 버튼 5개 중 하나만 고른다 (처음엔 선택 없음) */}
      <fieldset aria-describedby={errors.transport ? "transport-error" : undefined}>
        <legend className={legendClass}>교통수단</legend>
        <div className="flex flex-wrap gap-2">
          {TRANSPORTS.map((item) => (
            <label key={item} className={choiceBase}>
              <input
                type="radio"
                name="transport"
                value={item}
                checked={transport === item}
                onChange={() => onTransportChange(item)}
                className="sr-only"
              />
              {item}
            </label>
          ))}
        </div>
        {errors.transport && (
          <p id="transport-error" role="alert" className={errorClass}>
            {errors.transport}
          </p>
        )}
      </fieldset>

      {/* ④ 늦는 시간: 숫자(분)만 입력한다 */}
      <div>
        <label htmlFor="minutes" className={`block ${legendClass}`}>
          늦는 시간
        </label>
        <div className="flex items-baseline gap-3">
          <input
            id="minutes"
            name="minutes"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={`${LIMITS.minMinutes}~${LIMITS.maxMinutes}`}
            value={minutes}
            onChange={(event) => onMinutesChange(event.target.value)}
            aria-invalid={errors.minutes ? true : undefined}
            aria-describedby={errors.minutes ? "minutes-error" : undefined}
            // 숫자는 키가 큰 압축체(Antonio)로 크게, 칸은 밑줄만 있는 모양
            className="w-36 border-0 border-b border-cream/40 bg-transparent px-1 pb-1 font-display text-5xl leading-none text-cream outline-none transition-colors placeholder:text-cream/45 focus:border-cream aria-invalid:border-alert"
          />
          <span className="text-base text-cream/70">분</span>
        </div>
        {errors.minutes && (
          <p id="minutes-error" role="alert" className={errorClass}>
            {errors.minutes}
          </p>
        )}
      </div>

      {/* ⑥ 상사와의 관계: 격식 / 편한 사이 중 하나만 고른다 (처음엔 선택 없음) */}
      <fieldset aria-describedby={errors.relation ? "relation-error" : undefined}>
        <legend className={legendClass}>상사와의 관계</legend>
        <div className="flex flex-wrap gap-2">
          {RELATIONS.map((item) => (
            <label key={item} className={choiceBase}>
              <input
                type="radio"
                name="relation"
                value={item}
                checked={relation === item}
                onChange={() => onRelationChange(item)}
                className="sr-only"
              />
              {item}
            </label>
          ))}
        </div>
        {errors.relation && (
          <p id="relation-error" role="alert" className={errorClass}>
            {errors.relation}
          </p>
        )}
      </fieldset>

      {/* ⑦ 핑계 만들기 버튼: 누르면 입력 검사부터 한다. 만드는 중에는 눌리지 않는다 */}
      <button
        type="submit"
        disabled={loading || disabled}
        // 크림색으로 꽉 찬 알약 버튼 (Fernhollow의 "Let's talk" 알약과 같은 모양)
        className="rounded-full bg-cream px-8 py-4 text-base font-medium text-ink transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {loading ? "만드는 중…" : "핑계 만들기"}
      </button>
    </form>
  );
}
