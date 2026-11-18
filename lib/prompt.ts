// Design Ref: §4 "AI 지시문에 꼭 넣을 것" · §2 데이터 흐름 ⑤ 지시문 만들기 (PLAN 작업 7번)
// PRD 5장의 "AI가 지킬 규칙"을 AI에게 줄 지시문으로 옮긴다.
// 지시문의 규칙과 검사기(validate.ts의 checkMessage)의 기준은 항상 같아야 한다.
// 그래서 숫자 제한과 사유 분류는 constants.ts에서 가져온다. 거기만 바꾸면 둘이 함께 바뀐다.
// 이 파일은 글자만 만들고 AI를 부르지는 않는다. (호출은 작업 8번)
//
// 글의 질(2026-11-17 개선): 규칙만 지킨 "틀만 맞는 글"이 아니라, 듣는 사람이 사정을 납득하고
// "늦지 않으려고 애썼구나"라고 느끼는 글이 나오도록 ① 3문장 구성 ② 사유별 구체적 장면 ③ 좋은 예시
// ④ 요청마다 바뀌는 노력·만회 방향을 지시문에 넣었다.

import {
  LIMITS,
  REASON_CODES,
  REASON_LABELS,
  REASONS_BY_TRANSPORT,
  type ReasonCode,
} from "@/lib/constants";
import {
  toneOffendersOf,
  type MessageCheckContext,
  type MessageViolation,
} from "@/lib/validate";

/**
 * 사유 분류별 "구체적 장면" 예시. AI가 막연한 말("지연", "정체") 대신 상사가 장면을 떠올릴 수 있는
 * 한 가지 디테일을 고르도록 돕는다. (고유명사·숫자는 넣지 않는다 — 지어낸 정보가 되기 때문)
 * ReasonCode를 키로 써서, constants.ts에 사유를 추가하면 여기도 채우도록 컴파일러가 알려 준다.
 */
const REASON_SCENES: Record<ReasonCode, string> = {
  signal: "신호 점검으로 열차가 역 사이에서 한참 멈춤 / 신호등이 꺼져 교차로가 엉킴 / 건널목 신호가 유난히 길게 걸림",
  delay: "앞선 열차에 문제가 생겨 배차 간격이 크게 벌어짐 / 버스가 정류장에 한참 오지 않음 / 오던 열차가 한 번 건너뛰고 들어옴",
  crowd: "(지하철·버스) 승강장과 환승 통로가 사람으로 꽉 차 한 대를 보내야 했음 / (지하철·버스·택시) 줄이 길어 바로 타지 못함 / (도보) 보도와 건널목에 사람이 가득 차 걸음이 느려짐",
  traffic: "앞 차선이 길게 막혀 거의 움직이지 않음 / 교차로 신호가 몇 번 바뀌도록 앞 차들이 못 나감 / 갓길 차 한 대 때문에 한 줄로 늘어섬",
  weather: "(버스·택시·자가용) 갑작스러운 폭우로 차들이 서행 / (자가용·택시) 안개가 짙어 천천히 이동 / (도보) 쏟아진 비를 피해 잠깐 멈춤 / (도보) 길이 얼어 조심조심 걸음",
  roadwork: "갑작스러운 도로 공사로 길이 막혀 먼 길로 돌아감 / 보도가 공사로 막혀 건너편으로 돌아감 / 차선 한 개가 막혀 줄이 길어짐",
  light_health: "아침부터 두통이 있어 약을 챙기고 쉬어 가며 이동 (가벼운 컨디션 문제만) / 속이 불편해 잠깐 앉았다 이동 (가벼운 컨디션 문제만)",
  prep: "나서다가 꼭 챙겨야 할 자료를 놓친 게 떠올라 다시 가지러 돌아감 / 현관 앞에서 중요한 파일을 안 챙긴 걸 알고 되돌아감",
};

/** 사유 분류 목록을 "- signal: 신호 장애 — 예: …" 꼴의 줄로 만든다. */
const reasonCodeLines = REASON_CODES.map(
  (code) => `- ${code}: ${REASON_LABELS[code]} — 예: ${REASON_SCENES[code]}`,
).join("\n");

/**
 * 좋은 예시. 말투·교통수단·사유가 서로 다르다. 모두 검사기(checkMessage)를 통과하는 글이어야 한다.
 * 베껴 쓰라는 것이 아니라 "이 정도의 구체성과 성의"를 보여 주기 위한 것이다.
 */
const EXAMPLES = `[좋은 예시 — 이 정도의 구체성과 성의를 목표로 하되, 표현을 그대로 베끼지 마세요]
- (격식 · 지하철 · 25분) 지하철이 신호 점검으로 역 사이에 멈춰 25분 정도 늦겠습니다. 일찍 나섰는데도 이렇게 되어 죄송합니다. 이동 중 오전 업무부터 정리해 두겠습니다.
- (격식 · 버스 · 40분) 버스가 도로 공사로 먼 길을 돌아가 40분 정도 늦겠습니다. 여유 있게 나왔는데 예상 밖이라 죄송합니다. 도착하면 밀린 일부터 처리하겠습니다.
- (편한 사이 · 택시 · 15분) 택시를 탔는데 출근길이라 차가 길게 늘어서 15분 정도 늦을 것 같아요. 일찍 나왔는데도 늦어서 정말 미안해요. 가는 동안 오전 자료 훑어 둘게요.
- (편한 사이 · 도보 · 10분) 도보로 오는데 갑자기 비가 쏟아져서 10분 정도 늦을 것 같아요. 우산이 없어 잠깐 비를 피하느라 정말 미안해요. 도착하면 바로 이어서 일할게요.`;

/**
 * 시스템 지시문: 요청마다 바뀌지 않는 고정 규칙.
 * 상황(교통수단·시간·관계·피할 사유)은 buildUserPrompt가 따로 만든다.
 */
export const SYSTEM_PROMPT = `당신은 출근길에 지각하게 된 직장인이 상사에게 보낼 사과 메시지를 대신 써 주는 도우미입니다.

[목표]
읽는 상사가 "사정이 충분히 이해된다, 이 사람이 늦지 않으려고 정말 애썼구나"라고 느끼게 쓰세요.
"교통 정체로 늦겠습니다. 죄송합니다. 빨리 가겠습니다."처럼 성의 없고 뻔한 변명은 실패입니다.
글자 수를 아끼지 말고 구체적으로 쓰되, 허용 글자 수(${LIMITS.maxMessageLength}자)를 넘기면 그 메시지는 쓸 수 없습니다. 70~82자를 목표로 하고(1문장 약 34자, 2문장 약 24자, 3문장 약 20자), 다 쓴 뒤 글자 수를 직접 세어 82자를 넘으면 군더더기를 덜어 내세요.

[3문장 구성]
1문장 (상황): 교통수단 이름(예: "지하철", "자가용")을 글자 그대로 넣고, 상사가 장면을 떠올릴 수 있는 구체적인 디테일 한 가지와 늦는 시간을 함께 씁니다. "정체", "지연"처럼 막연한 말만 쓰지 말고 무슨 일이 어떻게 벌어졌는지 보이게 씁니다.
2문장 (노력과 책임): 이 사람이 미리 대비했고 늦지 않으려고 애썼다는 것이 드러나게 쓰고, 늦는 것에 대한 책임을 인정하며 사과합니다. 이 문장이 사과 문장입니다. 사정을 탓하며 끝내지 않습니다.
3문장 (만회): 지금부터 이 사람이 할 구체적인 행동 한 가지. "최대한 빨리 가겠습니다" 같은 빈말은 쓰지 않습니다.
말은 자연스러운 구어체로 씁니다. "~로 인해", "~에 따라" 같은 딱딱한 표현은 줄이고, 같은 표현을 되풀이하지 않습니다.
앞뒤가 맞지 않는 말은 쓰지 않습니다. (예: 지금 바로 알리는 글에서 "바로 알리지 못해 죄송합니다"나 "바로 알려 드려 죄송합니다", 교통수단에 어울리지 않는 장면) 상사에게 일을 시키거나 부탁하는 말("알려 주세요", "~해 주시기 바랍니다")은 쓰지 않습니다. 사과는 늦는다는 사실에 대해서만 합니다. 띄어쓰기와 어법을 바르게 씁니다.

[메시지 규칙 — 하나라도 어기면 그 메시지는 쓸 수 없습니다]
1. 3문장 이내, 공백을 포함해 ${LIMITS.maxMessageLength}자 이내로 씁니다. (82자를 넘기지 않도록 여유를 둡니다)
2. 사용자가 알려 준 교통수단 이름과 늦는 시간("○○분"처럼 숫자+분)을 글자 그대로 메시지에 넣습니다. "1시간 30분"이나 "반시간"처럼 단위를 바꿔 쓰지 않습니다.
3. 도착 시각을 쓰지 않고, "○○분 정도 늦겠습니다"처럼 늦는 시간으로 알립니다. 늦는 시간 외의 숫자(시각, 노선 번호, 출구 번호 등)는 쓰지 않습니다. 횟수나 순서는 "한 번", "두 번째"처럼 한글로 씁니다.
4. 말투는 모든 문장에 똑같이 적용합니다.
   - 관계가 "격식"이면 모든 문장을 "~습니다", "~합니다"처럼 "~니다"로 끝냅니다. "~요"로 끝나는 문장이 하나라도 있으면 실패입니다.
   - 관계가 "편한 사이"이면 모든 문장을 "~요"로 끝냅니다. "~습니다", "~합니다"처럼 "~니다"로 끝나는 문장이 하나라도 있으면 실패입니다. ("감사합니다요", "출발합니다요" 같은 어색한 끝맺음도 쓰지 않습니다)
   질문하지 말고 평서문으로만 씁니다. 말투는 3문장(만회)에서 가장 자주 섞입니다. 편한 사이라면 마지막 문장도 "~할게요", "~해 둘게요"처럼 "~요"로 끝내세요. ("~하겠습니다", "~살펴 답할게."처럼 말투가 달라지면 실패입니다)
5. 사과하는 문장을 정확히 1개 넣습니다. "죄송합니다", "죄송해요", "미안해요"처럼 "죄송" 또는 "미안"이 들어가게 씁니다.
6. 호칭과 직함은 쓰지 않습니다. 상사의 이름과 직함을 모르기 때문에 "팀장님" 같은 말로 시작하지 않고 바로 상황부터 말합니다.
7. 이모지, 마크다운, 따옴표 장식은 쓰지 않습니다.

[핑계 사유 규칙]
- 사유는 아래 분류 중 정확히 하나만 고르고, 고른 사유를 메시지에 자연스럽게 담습니다. 고른 교통수단에 어울리는 사유를 고르고, 예시의 장면을 그대로 쓰지 말고 그 교통수단에 맞게 구체적으로 바꿔 쓰세요. 예시에 나온 표현이나 장면을 매번 반복하지 말고, 요청마다 다른 장면을 만드세요.
${reasonCodeLines}
- 사용자가 "피할 사유"를 알려 주면, 그 분류는 고르지 않습니다.
- 거짓이면 문제가 커지는 핑계는 절대 쓰지 않습니다. 큰 질병, 큰 사고, 가족 사망, 병원·입원·응급·수술 이야기는 금지입니다. "사고"라는 단어 자체도 쓰지 않습니다. 가벼운 컨디션 문제(두통 등)와 신호 장애·지연·혼잡 같은 일상적인 사유만 씁니다.
- 노선 이름, 역 이름, 지명처럼 지어낸 구체적인 정보는 넣지 않습니다. 구체적인 디테일은 "열차가 역 사이에 멈춤", "횡단 대기가 길어짐"처럼 확인할 수 없는 일반적인 장면으로 씁니다.

${EXAMPLES}

[답변 형식]
다른 설명 없이 아래 모양의 JSON 객체 하나만 출력합니다. 코드 블록(\`\`\`)으로 감싸지 않습니다.
{"message": "<상사에게 보낼 메시지>", "reasonCode": "<위 분류 코드 중 하나>"}`;

/**
 * 요청마다 하나씩 골라 주는 "노력"과 "만회"의 방향. 글이 매번 같은 틀로 나오지 않게 한다.
 * 상황에 어울리지 않으면 AI가 자연스럽게 바꿔도 된다고 알려 준다.
 */
const EFFORT_ANGLES = [
  "평소보다 일찍 집을 나섰다",
  "상황을 보며 가장 빠른 방법을 계속 알아봤다",
  "여유 있게 출발했는데 예상 밖이었다",
  "대신 갈 방법을 찾아 바로 옮겨 봤다",
  "시간을 줄이려고 갈 수 있는 방법을 다 써 봤다",
];
const RECOVERY_ANGLES = [
  "이동 중에 오전 업무 순서를 미리 정리해 둔다",
  "급한 메시지부터 먼저 확인하고 답해 둔다",
  "도착하자마자 밀린 일부터 바로 처리한다",
  "오전에 쓸 자료를 이동 중에 미리 훑어 둔다",
  "오전 일정에서 놓치는 것이 없는지 이동 중에 점검한다",
  "오늘 꼭 끝낼 일의 순서를 이동 중에 먼저 정해 둔다",
];

/** 난수는 밖에서 바꿔 끼울 수 있게 해서(점검할 때 고정), 같은 입력에서도 글이 달라지게 한다. */
function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** 규칙을 어겼을 때 다시 만들도록 알려 주는 한 줄 안내 */
function violationHint(
  violation: MessageViolation,
  context: MessageCheckContext,
): string {
  switch (violation) {
    case "format":
      return `답변을 {"message": "...", "reasonCode": "..."} 모양의 JSON 하나로만 출력해 주세요.`;
    case "length":
      return `메시지가 공백 포함 ${LIMITS.maxMessageLength}자를 넘었어요. 구체성은 유지하되 군더더기를 줄여 ${LIMITS.maxMessageLength - 12}자 이내로 써 주세요.`;
    case "sentences":
      return `문장이 ${LIMITS.maxSentences}개를 넘었어요. ${LIMITS.maxSentences}문장 이내로 줄여 주세요.`;
    case "transport":
      return `교통수단 이름 "${context.transport}"이(가) 메시지에 글자 그대로 들어가야 해요.`;
    case "minutes":
      return `"${context.minutes}분"이 메시지에 글자 그대로 들어가야 해요. 단위를 바꿔 쓰지 마세요.`;
    case "arrival_time":
      return `도착 시각이나 숫자가 들어간 "~시" 표현을 쓰지 말고 "${context.minutes}분 정도 늦겠다"는 식으로 알려 주세요.`;
    case "tone":
      return context.relation === "격식"
        ? `모든 문장을 "~니다"로 끝내 주세요. 질문은 쓰지 마세요.`
        : `모든 문장을 "~요"로 끝내 주세요. 질문은 쓰지 마세요. ("감사합니다요"처럼 어색한 끝맺음도 쓰지 마세요)`;
    case "apology":
      return `"죄송" 또는 "미안"이 들어간 사과 문장을 1개 넣어 주세요.`;
    case "forbidden":
      return `질병·사고·사망·병원 이야기와 "사고"라는 단어는 쓰지 말고, 신호 장애·지연·혼잡 같은 가벼운 사유로 바꿔 주세요.`;
    case "reason_invalid":
      return `reasonCode는 위 분류 코드 중 하나만 써 주세요.`;
    case "reason_duplicate":
      return `피할 사유 분류를 골랐어요. 그 분류가 아닌 다른 사유로 써 주세요.`;
  }
}

/**
 * 사용자 지시문: 이번 요청의 상황을 알려 준다.
 * @param context 이미 검사를 통과한 입력값과 직전 사유 분류 코드 (최대 3개)
 * @param previousViolations 바로 앞 시도에서 어긴 규칙. 재시도할 때만 넣으면, 무엇을 고쳐야 하는지 함께 알려 준다.
 * @param random 노력·만회 방향을 고르는 난수(기본 Math.random). 점검할 때 고정된 값을 넣을 수 있다.
 * @param previousMessage 바로 앞 시도에서 AI가 쓴 글. 재시도할 때 함께 보여 주면(글자 수 포함) 어디를 고칠지 정확히 알 수 있다.
 */
export function buildUserPrompt(
  context: MessageCheckContext,
  previousViolations: readonly MessageViolation[] = [],
  random: () => number = Math.random,
  previousMessage?: string,
): string {
  const avoid =
    context.avoidReasons.length > 0
      ? context.avoidReasons.join(", ")
      : "없음";

  // 이 교통수단에 어울리고 직전에 쓰지 않은 사유만 후보로 준다. (후보가 비면 직전 사유만 뺀 전체에서 고르게 한다)
  const fitting = REASONS_BY_TRANSPORT[context.transport].filter(
    (code) => !context.avoidReasons.includes(code),
  );
  const choices =
    fitting.length > 0
      ? fitting
      : REASON_CODES.filter((code) => !context.avoidReasons.includes(code));

  const lines = [
    "[상황]",
    `- 교통수단: ${context.transport}`,
    `- 늦는 시간: ${context.minutes}분`,
    `- 상사와의 관계: ${context.relation}`,
    `- 피할 사유 분류: ${avoid}`,
    `- 이번에 고를 수 있는 사유 분류(이 중에서만 고르세요): ${choices.join(", ")}`,
    "",
    "[이번 글의 방향 — 상황에 어울리지 않으면 자연스럽게 바꿔도 됩니다]",
    `- 2문장(노력)에서 드러낼 것: ${pick(EFFORT_ANGLES, random)}`,
    `- 3문장(만회)에서 할 일: ${pick(RECOVERY_ANGLES, random)}`,
  ];

  if (previousViolations.length > 0) {
    // 바로 앞 글과 그 글자 수를 보여 주면, "줄여라"가 아니라 "몇 자를 어디서 줄여라"로 고칠 수 있다.
    if (previousMessage) {
      const length = [...previousMessage.replace(/\r?\n/g, "")].length;
      lines.push("", "[바로 앞 답변 — 이대로는 쓸 수 없습니다]", previousMessage, `(공백 포함 ${length}자)`);
    }
    lines.push(
      "",
      "[바로 앞 답변에서 고칠 점]",
      ...previousViolations.map((v) => `- ${violationHint(v, context)}`),
    );
    // 말투가 틀린 경우에는 어느 문장의 끝맺음이 틀렸는지 그대로 보여 준다
    if (previousViolations.includes("tone") && previousMessage) {
      const offenders = toneOffendersOf(previousMessage, context.relation);
      const want = context.relation === "격식" ? '"~니다"' : '"~요"';
      for (const sentence of offenders) {
        lines.push(`- 이 문장의 끝맺음이 말투와 맞지 않아요: "${sentence}" → 문장 끝을 ${want}로 고쳐 주세요.`);
      }
    }
    // 길이를 넘긴 경우에는 몇 자를 줄여야 하는지 구체적으로 알려 준다
    if (previousViolations.includes("length") && previousMessage) {
      const over = [...previousMessage.replace(/\r?\n/g, "")].length - (LIMITS.maxMessageLength - 12);
      if (over > 0) lines.push(`- 지난 글보다 ${over}자 이상 줄여서 ${LIMITS.maxMessageLength - 12}자 이내로 써 주세요.`);
    }
  }

  lines.push("", "위 상황에 맞는, 듣는 사람이 납득할 만큼 구체적이고 성의 있는 메시지를 만들어 주세요.");
  return lines.join("\n");
}
