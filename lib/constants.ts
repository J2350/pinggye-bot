// Design Ref: §2 데이터 흐름 · §4 파일 구성 — 화면과 서버가 함께 쓰는 "공통 약속"을 한 곳에 모은다. (PLAN 작업 2번)
// 이 파일은 값만 담는다. 값을 검사하는 함수는 validate.ts(작업 4·6번)에서 만든다.
// 화면(브라우저)과 서버가 모두 가져다 쓰므로 비밀 값(API 키 등)은 절대 넣지 않는다.

// ─────────────────────────────────────────────
// 입력 선택지 (DESIGN 1장 ③·⑥)
// ─────────────────────────────────────────────

/** 교통수단 버튼 5개. PRD에 목록이 없어 설계에서 정한 값이다. (PLAN "새로 정한 것" 참고) */
export const TRANSPORTS = ["지하철", "버스", "자가용", "택시", "도보"] as const;
export type Transport = (typeof TRANSPORTS)[number];

/** 상사와의 관계 선택 2개. 격식은 "-습니다"체, 편한 사이는 "-요"체로 쓴다. */
export const RELATIONS = ["격식", "편한 사이"] as const;
export type Relation = (typeof RELATIONS)[number];

// ─────────────────────────────────────────────
// 제한값 (PRD 5장 · DESIGN 2·3장)
// ─────────────────────────────────────────────

export const LIMITS = {
  /** 메시지 최대 글자 수 (공백 포함, 줄바꿈 제외) — PRD must 1 */
  maxMessageLength: 100,
  /** 메시지 최대 문장 수 — PRD must 1 */
  maxSentences: 3,
  /** 한 상황에서 "다시 만들기"로 성공할 수 있는 최대 횟수 — PRD must 2 */
  maxRegenerate: 5,
  /** 직전 핑계 사유를 몇 개까지 기억해 피할지 — PRD must 2 ("직전 3개") */
  maxAvoidReasons: 3,
  /** 늦는 시간(분) 최소·최대 — 설계 결정 (PLAN "새로 정한 것" 참고) */
  minMinutes: 1,
  maxMinutes: 180,
  /** 요청 한 번에 AI를 부르는 최대 횟수: 처음 1번 + 재시도 1번 — PRD 예외 처리 ("한 번 더") */
  maxGenerateAttempts: 2,
  /** AI 응답을 기다리는 시간(밀리초) — PRD 3장 "1분 이내" 목표에서 정한 설계 결정 */
  aiTimeoutMs: 10_000,
  /** 화면이 서버 응답을 기다리는 시간(밀리초). 서버가 AI를 최대 2번(10초씩) 부르므로 그보다 넉넉하게 둔다. (PLAN 작업 9번) */
  requestTimeoutMs: 30_000,
} as const;

// ─────────────────────────────────────────────
// 핑계 사유 분류 (DESIGN 2장 "핑계 사유 분류")
// ─────────────────────────────────────────────
// AI는 사유를 자유롭게 쓰지 않고 아래 코드 중 정확히 하나만 골라 답한다.
// "직전 3개와 다른 사유"인지는 이 코드로만 비교한다.

export const REASON_CODES = [
  "signal",
  "delay",
  "crowd",
  "traffic",
  "weather",
  "roadwork",
  "light_health",
  "prep",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** 사유 코드의 뜻. AI 지시문(작업 7번)에서 각 코드가 무엇을 가리키는지 알려줄 때 쓴다. */
export const REASON_LABELS: Record<ReasonCode, string> = {
  signal: "신호 장애",
  delay: "운행·배차 지연",
  crowd: "혼잡·대기 줄",
  traffic: "정체·막힘",
  weather: "비·눈·안개 등 날씨",
  roadwork: "공사·우회",
  light_health: "가벼운 컨디션 문제(두통 등)",
  prep: "출발 전 가벼운 준비 지연",
};

/**
 * 교통수단별로 "말이 되는" 사유 후보. 직전 사유를 빼고 남은 것 중에서만 AI가 고르게 해서,
 * 중복을 피하려다 어울리지 않는 사유(예: 자가용인데 "열차 지연")를 억지로 고르는 일을 막는다.
 * (2026-11-17: 실제 호출에서 사유 중복과 어색한 문장이 실패의 가장 큰 원인이어서 추가)
 */
export const REASONS_BY_TRANSPORT: Record<Transport, readonly ReasonCode[]> = {
  지하철: ["signal", "delay", "crowd", "light_health", "prep"],
  버스: ["delay", "crowd", "traffic", "weather", "roadwork", "signal", "light_health", "prep"],
  자가용: ["traffic", "roadwork", "weather", "signal", "light_health", "prep"],
  택시: ["traffic", "roadwork", "weather", "signal", "delay", "crowd", "light_health", "prep"],
  도보: ["weather", "signal", "roadwork", "crowd", "light_health", "prep"],
};

// ─────────────────────────────────────────────
// 규칙 검사기용 단어 목록 (DESIGN 2장 "규칙 검사기")
// ─────────────────────────────────────────────

/** 사과 문장으로 인정하는 단어. 이 중 하나가 들어간 문장이 1개 이상 있어야 한다. */
export const APOLOGY_WORDS = ["죄송", "미안", "송구"] as const;

/**
 * 금지 핑계 단어 (처음 버전). 하나라도 들어 있으면 규칙 위반이다.
 * PRD의 "큰 질병·큰 사고·가족 사망"을 보수적으로 해석해 "사고" 계열은 모두 막는다.
 * "돌아가"만으로는 걸지 않는다. ("우회해서 돌아가느라" 같은 정상 문장을 살리기 위해)
 */
export const FORBIDDEN_WORDS = [
  "응급실",
  "입원",
  "병원",
  "수술",
  "골절",
  "구급차",
  "119",
  "암",
  "사고",
  "추돌",
  "충돌",
  "사망",
  "부고",
  "장례",
  "돌아가셨",
  "돌아가신",
] as const;
