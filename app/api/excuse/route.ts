// Design Ref: §2 데이터 흐름 ④~⑧ · §5 오류 처리 — 서버 창구: POST /api/excuse (PLAN 작업 8번)
// 화면이 보낸 입력을 다시 검사하고, AI로 메시지를 만들고, 규칙 검사·1회 재시도를 거쳐 결과를 돌려준다.
// API 키는 lib/ai.ts 안에서만 읽는다. 이 파일은 키를 직접 다루지 않는다.
// (Route Handler 파일에는 HTTP 함수 외의 것을 내보낼 수 없어서, 아래 도우미 함수는 내보내지 않는다.)

import { askAi } from "@/lib/ai";
import { LIMITS, REASON_CODES, type ReasonCode } from "@/lib/constants";
import { generateExcuse, ServerConfigError } from "@/lib/generate";
import { checkHeaders, checkRateLimit, GUARD } from "@/lib/guard";
import { validateInput } from "@/lib/validate";

/** 오류 응답을 만든다. (DESIGN 2장 "서버 → 화면" 표) */
function errorResponse(status: number, code: string, field?: string): Response {
  return Response.json({ error: { code, ...(field ? { field } : {}) } }, { status });
}

/**
 * 화면이 보낸 "직전 사유 분류 코드 목록"을 검사한다.
 * 최대 3개이고 모두 정해진 분류 코드일 때만 받는다. 아니면 null.
 * (배포 주소로 아무 글이나 보내 AI 지시문에 끼워 넣거나 비용을 쓰는 것을 막기 위해서)
 */
function parseAvoidReasons(raw: unknown): ReasonCode[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > LIMITS.maxAvoidReasons) return null;
  const codes: ReasonCode[] = [];
  for (const item of raw) {
    const code = REASON_CODES.find((candidate) => candidate === item);
    if (!code) return null;
    codes.push(code);
  }
  return codes;
}

export async function POST(request: Request): Promise<Response> {
  // ③ 문지기: 다른 사이트·JSON 아닌 요청·큰 요청을 거르고, 같은 접속자의 연타를 막는다. (AI 호출 전에 먼저)
  const headerCheck = checkHeaders(request);
  if (!headerCheck.ok) return errorResponse(headerCheck.status, headerCheck.code);
  const rateCheck = checkRateLimit(request);
  if (!rateCheck.ok) return errorResponse(rateCheck.status, rateCheck.code);

  // ④ 입력 다시 검사 (화면의 검사를 믿지 않는다)
  // content-length를 속이거나 생략해도 되도록, 읽은 글자 수로도 한 번 더 크기를 확인한다.
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > GUARD.maxBodyBytes) return errorResponse(413, "PAYLOAD_TOO_LARGE");
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "INVALID_INPUT", "body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(400, "INVALID_INPUT", "body");
  }
  const { transport, minutes, relation, avoidReasons } = body as Record<string, unknown>;

  const input = validateInput({ transport, minutes, relation });
  if (!input.ok) {
    return errorResponse(400, "INVALID_INPUT", Object.keys(input.errors)[0]);
  }
  const avoid = parseAvoidReasons(avoidReasons);
  if (!avoid) {
    return errorResponse(400, "INVALID_INPUT", "avoidReasons");
  }

  // ⑤~⑧ 메시지 만들기 (규칙 검사와 1회 재시도 포함)
  try {
    const result = await generateExcuse({ ...input.value, avoidReasons: avoid }, askAi);
    if (!result.ok) {
      return errorResponse(503, "GENERATION_FAILED");
    }
    return Response.json({ message: result.message, reasonCode: result.reasonCode });
  } catch (error) {
    if (error instanceof ServerConfigError) {
      // 로그에는 원인(키 없음 등)만 남기고, 키 값은 남기지 않는다.
      console.error(`[excuse] 서버 설정 문제: ${error.message}`);
      return errorResponse(500, "SERVER_CONFIG");
    }
    console.error(`[excuse] 예상하지 못한 오류: ${error instanceof Error ? error.name : "UnknownError"}`);
    return errorResponse(503, "GENERATION_FAILED");
  }
}
