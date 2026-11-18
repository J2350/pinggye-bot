// 보안 점검 SEC-001·SEC-004 대응: 공개 주소로 AI 요금을 마구 쓰는 것을 막는 "문지기".
// 서버(app/api/excuse/route.ts)가 AI를 부르기 "전에" 아래 순서로 거른다.
//   1) 다른 사이트에서 보낸 요청 거절 (Origin이 우리 주소와 다를 때)
//   2) JSON이 아닌 요청 거절 (Content-Type)
//   3) 너무 큰 요청 거절 (본문 크기)
//   4) 같은 접속자(IP)가 짧은 시간에 너무 많이 누르면 거절 (요청 횟수 제한)
// 주의: 횟수 제한은 서버 한 대(인스턴스)의 메모리에만 기록한다. 서버가 여러 대로 늘어나거나 다시 시작되면
//       기록이 따로 놀아 "대략적인 방어"가 된다. 확실한 방어는 Vercel Firewall의 Rate Limit 규칙과 함께 쓴다.

/** 문지기 설정값 */
export const GUARD = {
  /** 요청 본문 최대 크기(바이트). 정상 요청은 100바이트 안팎이다. */
  maxBodyBytes: 1024,
  /** 1분 안에 한 접속자가 보낼 수 있는 횟수. 만들기 1번 + 다시 만들기 5번 = 6번이 정상 사용의 최대치다. */
  perMinute: 10,
  /** 1시간 안에 한 접속자가 보낼 수 있는 횟수 */
  perHour: 60,
  /** 이 서버 한 대가 1시간 안에 받아 줄 전체 요청 수. 접속자 주소를 바꿔 가며 보내는 공격의 마지막 방어선이다. */
  globalPerHour: 600,
  /** 기록해 두는 접속자 수의 상한 (메모리가 끝없이 늘지 않게) */
  maxTrackedClients: 5000,
} as const;

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** 접속자별 요청 시각 기록 */
const hitsByClient = new Map<string, number[]>();
let globalHits: number[] = [];

export type GuardResult = { ok: true } | { ok: false; status: number; code: string };

/** 접속자 구분값. Vercel이 붙여 주는 헤더에서 읽고, 없으면 하나로 묶는다. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** 오래된 기록을 지운 새 목록 */
function recent(times: number[], now: number, windowMs: number): number[] {
  return times.filter((time) => now - time < windowMs);
}

/**
 * 헤더만으로 판단하는 검사: 다른 사이트에서 온 요청, JSON이 아닌 요청, 큰 요청을 거른다.
 * (브라우저는 다른 사이트에서 보낸 요청에 Origin을 붙인다. 스크립트가 Origin을 속일 수는 있어서 횟수 제한과 같이 쓴다.)
 */
export function checkHeaders(request: Request): GuardResult {
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      return { ok: false, status: 403, code: "FORBIDDEN" };
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, code: "UNSUPPORTED_MEDIA_TYPE" };
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > GUARD.maxBodyBytes) {
    return { ok: false, status: 413, code: "PAYLOAD_TOO_LARGE" };
  }
  return { ok: true };
}

/**
 * 요청 횟수 제한. 통과하면 이번 요청을 기록한다. (거절된 요청은 기록하지 않아, 기다리면 풀린다)
 * 입력 검사보다 "먼저" 부른다. 틀린 입력을 계속 보내는 것도 서버 힘을 쓰기 때문이다.
 */
export function checkRateLimit(request: Request, now: number = Date.now()): GuardResult {
  const key = clientKey(request);

  globalHits = recent(globalHits, now, HOUR);
  if (globalHits.length >= GUARD.globalPerHour) {
    return { ok: false, status: 429, code: "RATE_LIMITED" };
  }

  const hits = recent(hitsByClient.get(key) ?? [], now, HOUR);
  const lastMinute = hits.filter((time) => now - time < MINUTE).length;
  if (hits.length >= GUARD.perHour || lastMinute >= GUARD.perMinute) {
    hitsByClient.set(key, hits);
    return { ok: false, status: 429, code: "RATE_LIMITED" };
  }

  hits.push(now);
  hitsByClient.set(key, hits);
  globalHits.push(now);

  // 기록이 너무 많아지면 한 시간 넘게 조용한 접속자부터 지운다
  if (hitsByClient.size > GUARD.maxTrackedClients) {
    for (const [client, times] of hitsByClient) {
      if (recent(times, now, HOUR).length === 0) hitsByClient.delete(client);
    }
    // 그래도 넘치면 가장 오래된 기록부터 지운다 (Map은 넣은 순서를 기억한다)
    for (const client of hitsByClient.keys()) {
      if (hitsByClient.size <= GUARD.maxTrackedClients) break;
      hitsByClient.delete(client);
    }
  }
  return { ok: true };
}

/** 임시 점검용: 기록을 비운다 (테스트에서만 쓴다) */
export function resetGuardForTest(): void {
  hitsByClient.clear();
  globalHits = [];
}
