// Design Ref: §3 기술 선택(OpenAI SDK · server-only) · §2 데이터 흐름 ⑤⑥ (PLAN 작업 5번, AI 서비스를 Claude에서 OpenAI로 교체)
// 메시지를 만드는 AI에 연결하는 곳. API 키를 읽는 유일한 파일이다.
// 아래 한 줄이 "이 파일은 서버에서만 쓴다"는 잠금장치다. 화면(브라우저) 쪽 코드가 실수로 이 파일을
// 가져오면 빌드 단계에서 바로 오류가 나서, 키가 사용자 화면으로 새어 나가지 못한다.
import "server-only";

import OpenAI from "openai";

import { LIMITS } from "@/lib/constants";
import { ServerConfigError } from "@/lib/generate";

/**
 * 메시지를 만들 AI 모델. 짧은 메시지(100자 이내)에 알맞게 빠르고 저렴한 모델을 쓴다.
 * 품질이 부족하면 이 줄 하나만 더 큰 모델로 바꿔 올릴 수 있다.
 */
export const AI_MODEL = "gpt-4.1-mini";

/**
 * API 키가 없을 때 던지는 오류. ServerConfigError의 한 종류라서,
 * 서버(route.ts)가 500 SERVER_CONFIG 응답으로 바꿔 준다. (DESIGN 5장 "API 키가 없음")
 * 메시지에는 키 값이 들어가지 않는다.
 */
export class MissingApiKeyError extends ServerConfigError {
  constructor() {
    super("OPENAI_API_KEY가 설정되어 있지 않습니다. my-app/.env를 확인해 주세요.");
    this.name = "MissingApiKeyError";
  }
}

let client: OpenAI | null = null;

/**
 * AI 연결 도구(클라이언트)를 돌려준다. 처음 부를 때 한 번만 만든다.
 * - 키는 .env의 OPENAI_API_KEY에서만 읽는다. (NEXT_PUBLIC_ 이름은 쓰지 않는다)
 * - maxRetries: 0 → SDK가 알아서 다시 시도하지 않는다. 재시도는 서버가 "딱 1번"만 직접 한다. (PRD 예외 처리)
 * - timeout: 10초 → 응답이 늦으면 포기한다. SDK 기본값은 10분이라 "1분 이내" 목표가 깨진다.
 */
export function getAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  client ??= new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: LIMITS.aiTimeoutMs,
  });
  return client;
}

/** AI가 돌려줄 글의 최대 길이(토큰). 메시지는 100자 이내라 JSON까지 합쳐도 넉넉하다. */
const MAX_OUTPUT_TOKENS = 400;

/**
 * AI에게 지시문을 보내고 답의 글자를 돌려준다. (generate.ts의 AskAi 구현)
 * - 답은 JSON 객체 하나로 받는다(response_format json_object). 지시문에 "JSON"이라는 말이 들어 있어야 쓸 수 있다.
 * - 요청 자체가 잘못됐거나(400) 키가 틀렸거나(401·403) 모델 이름이 없거나(404) 결제 한도를 다 쓴 경우(429 insufficient_quota)는
 *   다시 해도 소용없으므로 ServerConfigError로 바꿔 던진다. 그 밖의 오류(시간 초과·일시적 429·5xx·연결 실패)는
 *   그대로 던져서 서버가 "응답 없음"으로 보고 1번 다시 시도한다.
 */
export async function askAi(system: string, user: string): Promise<string> {
  const openai = getAiClient();
  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      // 무작위성을 낮춰(0.3) 말투가 섞이거나 글자 수를 넘기는 일을 줄인다. 같은 입력이어도 글이 달라지는 것은
      // 요청마다 바뀌는 노력·만회 방향과 직전 사유 회피가 맡는다. (temperature를 받지 않는 모델로 바꾸면 이 줄을 뺀다)
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    if (error instanceof OpenAI.APIError && typeof error.status === "number") {
      const outOfQuota = error.status === 429 && error.code === "insufficient_quota";
      if ([400, 401, 403, 404].includes(error.status) || outOfQuota) {
        // 오류 메시지 원문은 붙이지 않는다. (HTTP 상태만 남긴다)
        throw new ServerConfigError(`AI 요청이 거절되었습니다 (HTTP ${error.status})`);
      }
    }
    throw error;
  }
}