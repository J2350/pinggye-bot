// Design Ref: §2 데이터 흐름 ⑤⑥⑦⑧ — 지시문 만들기 → AI 호출 → 규칙 검사 → 실패하면 딱 1번만 다시 (PLAN 작업 8번)
// 서버 창구(app/api/excuse/route.ts)가 쓰는 "메시지 만들기" 로직이다.
// AI를 실제로 부르는 함수는 밖에서 받아서(askAi) 쓴다. 그래서 이 파일은 AI·API 키 없이도 점검할 수 있다.
// (route.ts에는 HTTP 함수 외에는 내보낼 수 없어서, 점검할 로직을 이 파일로 분리했다.)

import { LIMITS, type ReasonCode } from "@/lib/constants";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompt";
import {
  checkMessage,
  type MessageCheckContext,
  type MessageViolation,
  type RawAiAnswer,
} from "@/lib/validate";

/**
 * 서버 설정 문제(API 키 없음·틀림, 요청 형식 오류 등)를 나타내는 오류.
 * 다시 시도해도 해결되지 않으므로 재시도하지 않고, 서버가 500 SERVER_CONFIG로 바꿔 응답한다.
 * 메시지에는 키 값 같은 비밀을 절대 넣지 않는다.
 */
export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

/** AI에게 지시문을 보내고, 답의 글자를 돌려주는 함수. 실제 구현은 lib/ai.ts의 askAi. */
export type AskAi = (system: string, user: string) => Promise<string>;

export type GenerateResult =
  | { ok: true; message: string; reasonCode: ReasonCode; attempts: number }
  | { ok: false; attempts: number; violations: MessageViolation[] };

const EMPTY_ANSWER: RawAiAnswer = { message: undefined, reasonCode: undefined };

/**
 * AI의 답(글자)에서 {message, reasonCode}를 읽는다.
 * 코드 블록(```)이나 앞뒤 설명이 붙어 있어도 첫 "{"부터 마지막 "}"까지만 읽는다.
 * 읽지 못하면 빈 답을 돌려주고, 검사기가 "format" 위반으로 처리한다.
 */
function parseAnswer(text: string): RawAiAnswer {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return EMPTY_ANSWER;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return { message: record.message, reasonCode: record.reasonCode };
    }
  } catch {
    // JSON이 아니면 아래에서 빈 답으로 처리한다.
  }
  return EMPTY_ANSWER;
}

/**
 * 메시지를 만든다. 최대 LIMITS.maxGenerateAttempts번(처음 1번 + 재시도 1번)까지 시도한다.
 * - 응답이 없거나(시간 초과·네트워크·서버 오류) 규칙을 어기면 한 번 더 만든다. (PRD 예외 처리)
 * - 재시도할 때는 앞 시도에서 어긴 규칙을 지시문에 함께 알려 준다.
 * - 서버 설정 문제(ServerConfigError)는 재시도하지 않고 그대로 던진다.
 */
export async function generateExcuse(
  context: MessageCheckContext,
  askAi: AskAi,
): Promise<GenerateResult> {
  let violations: MessageViolation[] = [];
  // 바로 앞 시도에서 AI가 쓴 글. 재시도 지시문에 함께 보여 줘서 어디를 고칠지 정확히 알게 한다.
  let lastMessage: string | undefined;

  for (let attempt = 1; attempt <= LIMITS.maxGenerateAttempts; attempt++) {
    let text: string;
    try {
      text = await askAi(SYSTEM_PROMPT, buildUserPrompt(context, violations, undefined, lastMessage));
    } catch (error) {
      if (error instanceof ServerConfigError) throw error;
      // 응답 없음·시간 초과 등: 오류 종류만 기록한다. (요청 내용이나 키는 기록하지 않는다)
      const kind = error instanceof Error ? error.name : "UnknownError";
      console.warn(`[excuse] AI 호출 실패 (시도 ${attempt}/${LIMITS.maxGenerateAttempts}): ${kind}`);
      continue;
    }

    const answer = parseAnswer(text);
    const result = checkMessage(answer, context);
    if (result.ok) {
      return { ok: true, message: result.message, reasonCode: result.reasonCode, attempts: attempt };
    }
    violations = result.violations;
    lastMessage = typeof answer.message === "string" && answer.message.trim() !== "" ? answer.message.trim() : undefined;
    console.warn(
      `[excuse] 규칙 위반 (시도 ${attempt}/${LIMITS.maxGenerateAttempts}): ${violations.join(", ")}`,
    );
  }

  return { ok: false, attempts: LIMITS.maxGenerateAttempts, violations };
}
