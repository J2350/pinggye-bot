// Design Ref: §1 화면 상태 "입력이 덜 됐을 때" · §2 ②④ 입력 검사 (PLAN 작업 4번)
// 1) 사용자가 고른·입력한 값이 올바른지 검사한다. (PLAN 작업 4번) 화면(②)과 서버(④)가 같은 함수를 쓰도록 여기에 둔다.
// 2) AI가 만든 메시지가 PRD 규칙을 지켰는지 검사한다. (PLAN 작업 6번, 파일 맨 아래 checkMessage) 서버(⑦)에서 쓴다.

import {
  APOLOGY_WORDS,
  FORBIDDEN_WORDS,
  LIMITS,
  REASON_CODES,
  RELATIONS,
  TRANSPORTS,
  type ReasonCode,
  type Relation,
  type Transport,
} from "@/lib/constants";

/** 검사하는 입력 칸 이름. 서버가 400 응답으로 "어느 칸이 문제인지" 알려줄 때도 이 이름을 쓴다. */
export type InputField = "transport" | "minutes" | "relation";

/** 칸별 안내 문구. 문제가 없는 칸은 키 자체가 없다. */
export type InputErrors = Partial<Record<InputField, string>>;

/** 칸별 안내 문구 (DESIGN 1장 화면 상태표 그대로) */
export const INPUT_ERROR_MESSAGES: Record<InputField, string> = {
  transport: "교통수단을 골라 주세요",
  minutes: `늦는 시간을 ${LIMITS.minMinutes}~${LIMITS.maxMinutes} 사이 숫자로 입력해 주세요`,
  relation: "상사와의 관계를 골라 주세요",
};

/** 검사 전의 입력값. 화면에서는 글자·null, 서버에서는 어떤 값이든 올 수 있어서 unknown으로 받는다. */
export type RawInput = {
  transport: unknown;
  minutes: unknown;
  relation: unknown;
};

/** 검사를 통과한 입력값. minutes는 숫자로 바뀐다. */
export type ValidInput = {
  transport: Transport;
  minutes: number;
  relation: Relation;
};

export type ValidationResult =
  | { ok: true; value: ValidInput }
  | { ok: false; errors: InputErrors };

/**
 * 늦는 시간(분)을 읽는다. 1~180 사이 정수만 인정하고, 아니면 null.
 * - 글자: 앞뒤 공백을 뺀 뒤 숫자(0~9)만 있어야 한다. "abc", "20.5", "-3", 빈칸은 모두 null.
 * - 숫자: 정수여야 한다. (서버가 JSON으로 받은 값 대비)
 */
function parseMinutes(raw: unknown): number | null {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    if (!/^\d+$/.test(text)) return null;
    value = Number(text);
  } else {
    return null;
  }
  if (!Number.isInteger(value)) return null;
  if (value < LIMITS.minMinutes || value > LIMITS.maxMinutes) return null;
  return value;
}

/** 교통수단·늦는 시간·상사와의 관계가 모두 올바른지 검사한다. */
export function validateInput(input: RawInput): ValidationResult {
  const errors: InputErrors = {};

  const transport = TRANSPORTS.find((item) => item === input.transport);
  if (!transport) errors.transport = INPUT_ERROR_MESSAGES.transport;

  const minutes = parseMinutes(input.minutes);
  if (minutes === null) errors.minutes = INPUT_ERROR_MESSAGES.minutes;

  const relation = RELATIONS.find((item) => item === input.relation);
  if (!relation) errors.relation = INPUT_ERROR_MESSAGES.relation;

  if (!transport || minutes === null || !relation) {
    return { ok: false, errors };
  }
  return { ok: true, value: { transport, minutes, relation } };
}

// ═════════════════════════════════════════════
// 메시지 규칙 검사기 (PLAN 작업 6번 · DESIGN 2장 "규칙 검사기 — 세는 방법과 기준")
// ═════════════════════════════════════════════
// 아래 항목을 모두 통과해야 한다. 하나라도 어기면 서버가 1번만 다시 만든다. (PRD 예외 처리)

/** 어긴 규칙의 이름. 여러 개가 한꺼번에 나올 수 있다. */
export type MessageViolation =
  | "format" // AI 답을 {message, reasonCode}로 읽지 못함
  | "length" // 100자 초과
  | "sentences" // 3문장 초과
  | "transport" // 고른 교통수단 이름이 없음
  | "minutes" // "{분}분"이 글자 그대로 없음
  | "arrival_time" // "9시"처럼 도착 시각을 씀
  | "tone" // 말투가 관계와 안 맞음
  | "apology" // 사과 문장이 없음
  | "forbidden" // 금지 핑계 단어
  | "reason_invalid" // 정해진 사유 분류가 아님
  | "reason_duplicate"; // 직전 3개와 같은 사유

/** 검사에 필요한 "이번 요청의 상황". 서버가 이미 검사를 통과한 입력값으로 채운다. */
export type MessageCheckContext = {
  transport: Transport;
  minutes: number;
  relation: Relation;
  /** 직전에 쓴 사유 분류 코드 (최대 3개) */
  avoidReasons: readonly ReasonCode[];
};

/** 검사 전의 AI 답. 어떤 값이든 올 수 있어서 unknown으로 받는다. */
export type RawAiAnswer = { message: unknown; reasonCode: unknown };

export type MessageCheckResult =
  | { ok: true; message: string; reasonCode: ReasonCode }
  | { ok: false; violations: MessageViolation[] };

/** 문장 나누기: `. ? ! …`로 자른 뒤 빈 조각을 뺀다. 마침표 없이 끝나는 마지막 조각도 1문장이다. */
function splitSentences(text: string): string[] {
  return text
    .split(/[.?!…]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** 문장 끝의 문장부호·이모지·공백을 떼고 남은 글자 (말투 검사용) */
function stripTrailingSymbols(sentence: string): string {
  return sentence.replace(/[^\p{L}\p{N}]+$/u, "");
}

/**
 * 문장 목록에서 관계에 맞는 끝맺음("격식"→"니다", "편한 사이"→"요")이 아닌 문장만 골라낸다.
 * 검사기(checkMessage)와 재시도 안내(prompt.ts)가 같은 기준을 쓰도록 한 곳에 둔다.
 */
export function findToneOffenders(sentences: readonly string[], relation: Relation): string[] {
  const expectedEnding = relation === "격식" ? "니다" : "요";
  return sentences.filter((sentence) => !stripTrailingSymbols(sentence).endsWith(expectedEnding));
}

/** 메시지 글을 문장으로 나눠 말투가 틀린 문장만 돌려준다. (재시도 안내용) */
export function toneOffendersOf(message: string, relation: Relation): string[] {
  return findToneOffenders(splitSentences(message.replace(/\r?\n/g, " ")), relation);
}

/** 금지 단어가 들어 있는지 본다. */
function containsForbiddenWord(text: string, minutes: number): boolean {
  // "119분 늦겠습니다"의 "119"가 금지 단어로 걸리지 않도록, 늦는 시간 표현은 먼저 지운다.
  // 또 "암튼(아무튼)", "암호"는 질병 이야기가 아니므로 지운다.
  const cleaned = text.replaceAll(`${minutes}분`, " ").replace(/암(튼|호)/g, " ");
  return FORBIDDEN_WORDS.some((word) => {
    if (word.length === 1) {
      // 한 글자 단어("암")는 낱말 첫머리에서만 찾는다. ("상암동"의 '암'은 걸리지 않게)
      return new RegExp(`(?<![가-힣])${word}`, "u").test(cleaned);
    }
    return cleaned.includes(word);
  });
}

/**
 * AI가 만든 메시지가 PRD 규칙을 지켰는지 검사한다.
 * 통과하면 다듬은 메시지와 사유 코드를, 어기면 어긴 규칙 목록을 돌려준다.
 */
export function checkMessage(
  answer: RawAiAnswer,
  context: MessageCheckContext,
): MessageCheckResult {
  // 형식: 메시지는 비어 있지 않은 글자여야 한다. (사유 코드는 아래 "중복" 단계에서 따로 본다)
  if (typeof answer.message !== "string" || answer.message.trim() === "") {
    return { ok: false, violations: ["format"] };
  }
  const message = answer.message.trim();
  // 줄바꿈은 길이를 셀 때는 지우고, 나머지 검사에서는 공백으로 본다.
  const oneLine = message.replace(/\r?\n/g, " ");
  const violations: MessageViolation[] = [];

  // 길이: 공백 포함 100자 이내 (줄바꿈 제외, 이모지도 1글자)
  if ([...message.replace(/\r?\n/g, "")].length > LIMITS.maxMessageLength) {
    violations.push("length");
  }

  // 문장 수: 3문장 이내
  const sentences = splitSentences(oneLine);
  if (sentences.length > LIMITS.maxSentences) violations.push("sentences");

  // 교통수단: 고른 이름이 글자 그대로 들어 있어야 한다.
  if (!oneLine.includes(context.transport)) violations.push("transport");

  // 늦는 시간: "{분}분"이 글자 그대로 있어야 한다. "120분"이 "20분"으로 잘못 인정되지 않게 앞 글자가 숫자가 아닌지도 본다.
  if (!new RegExp(`(?<!\\d)${context.minutes}분`).test(oneLine)) {
    violations.push("minutes");
  }

  // 도착 시각 금지: "9시", "10시 30분"처럼 숫자+시는 불통과. ("1시간"은 늦는 시간 표현이라 허용)
  if (/\d\s*시(?!간)/.test(oneLine)) violations.push("arrival_time");

  // 말투: 모든 문장 끝을 본다. 격식은 "니다", 편한 사이는 "요"로 끝나야 한다.
  if (findToneOffenders(sentences, context.relation).length > 0) {
    violations.push("tone");
  }

  // 사과: 사과 단어가 들어간 문장이 1개 이상 있어야 한다.
  if (!sentences.some((sentence) => APOLOGY_WORDS.some((word) => sentence.includes(word)))) {
    violations.push("apology");
  }

  // 금지 핑계: 큰 질병·큰 사고·가족 사망 관련 단어가 있으면 불통과
  if (containsForbiddenWord(oneLine, context.minutes)) violations.push("forbidden");

  // 사유: 정해진 분류 중 하나여야 하고, 직전 3개와 같으면 안 된다.
  const reasonCode = REASON_CODES.find((code) => code === answer.reasonCode);
  if (!reasonCode) {
    violations.push("reason_invalid");
  } else if (context.avoidReasons.includes(reasonCode)) {
    violations.push("reason_duplicate");
  }

  if (violations.length > 0 || !reasonCode) {
    return { ok: false, violations };
  }
  return { ok: true, message, reasonCode };
}
