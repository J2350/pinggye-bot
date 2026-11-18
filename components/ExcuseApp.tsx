// Design Ref: §4 파일 구성 — ExcuseApp: 화면 전체의 상태를 들고 있고 서버와 주고받는 부품 (PLAN 작업 3·4·9·11·12번)
// 입력값, 검사 안내, "만드는 중", 만들어진 메시지, 실패 안내, 직전 사유, 마지막으로 만든 상황,
// 다시 만들기 횟수(5번 제한)와 "입력이 바뀌었어요" 판단을 관리한다. (DESIGN 1장 "다시 만들기 횟수를 세는 법")
"use client";

import { useState } from "react";

import ExcuseForm from "@/components/ExcuseForm";
import ExcuseResult from "@/components/ExcuseResult";
import {
  LIMITS,
  REASON_CODES,
  type ReasonCode,
  type Relation,
  type Transport,
} from "@/lib/constants";
import { validateInput, type ValidInput } from "@/lib/validate";

// 실패했을 때 화면에 보여줄 안내 문구 (DESIGN 1장 화면 상태표)
const NOTICE_RETRY = "잠시 후 다시 눌러 주세요";
const NOTICE_CONFIG = "서버 설정에 문제가 있어요. 작성자에게 알려 주세요";
// 버튼이 막혔을 때 이유를 알려 주는 문구 (DESIGN 1장)
const HINT_EXHAUSTED = "상황을 새로 입력해 주세요";
const HINT_INPUT_CHANGED = "입력이 바뀌었어요. '핑계 만들기'를 눌러 새로 만들어 주세요";

type RequestOutcome =
  | { ok: true; message: string; reasonCode: ReasonCode }
  | { ok: false; notice: string };

/**
 * 서버(POST /api/excuse)에 메시지를 만들어 달라고 요청한다. (DESIGN 2장 ③·⑨)
 * @param avoidReasons 직전에 쓴 사유 분류 코드(최대 3개). 서버가 이 사유는 피해서 만든다.
 * 어떤 실패든 던지지 않고, 화면에 보여줄 안내 문구로 바꿔서 돌려준다.
 */
async function requestExcuse(
  input: ValidInput,
  avoidReasons: readonly ReasonCode[],
): Promise<RequestOutcome> {
  try {
    const response = await fetch("/api/excuse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, avoidReasons }),
      // 서버가 응답하지 않으면 무한정 기다리지 않는다
      signal: AbortSignal.timeout(LIMITS.requestTimeoutMs),
    });

    const data: unknown = await response.json().catch(() => null);

    if (response.ok && typeof data === "object" && data !== null) {
      const { message, reasonCode } = data as { message?: unknown; reasonCode?: unknown };
      const code = REASON_CODES.find((candidate) => candidate === reasonCode);
      if (typeof message === "string" && message.length > 0 && code) {
        return { ok: true, message, reasonCode: code };
      }
    }

    // 서버 설정 문제(500 SERVER_CONFIG)는 다시 눌러도 소용없으므로 다른 문구를 보여준다.
    const errorCode =
      typeof data === "object" && data !== null
        ? (data as { error?: { code?: unknown } }).error?.code
        : undefined;
    if (errorCode === "SERVER_CONFIG") return { ok: false, notice: NOTICE_CONFIG };
    return { ok: false, notice: NOTICE_RETRY };
  } catch {
    // 네트워크 끊김, 시간 초과 등
    return { ok: false, notice: NOTICE_RETRY };
  }
}

export default function ExcuseApp() {
  // 처음엔 교통수단과 관계 모두 "선택 없음" (DESIGN 1장 ③·⑥)
  const [transport, setTransport] = useState<Transport | null>(null);
  const [minutes, setMinutes] = useState("");
  const [relation, setRelation] = useState<Relation | null>(null);
  // "핑계 만들기"를 한 번이라도 눌러 봤는지. 누르기 전에는 안내 문구를 띄우지 않는다.
  const [submitted, setSubmitted] = useState(false);
  // 서버가 일하는 중인지: 새로 만드는 중("create"), 다시 만드는 중("regenerate"), 쉬는 중(null)
  const [working, setWorking] = useState<"create" | "regenerate" | null>(null);
  // 만들어진 메시지, 그리고 실패 안내 (다시 만들기가 실패하면 둘 다 값이 있을 수 있다)
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 마지막으로 메시지를 만든 때의 상황. "다시 만들기"는 이 상황으로 만든다.
  const [lastInput, setLastInput] = useState<ValidInput | null>(null);
  // 직전에 쓴 사유 분류 코드(최근 3개, 오래된 것부터). "다시 만들기"에서 피할 사유로 보낸다.
  const [reasons, setReasons] = useState<ReasonCode[]>([]);
  // "다시 만들기"로 성공한 횟수. 첫 "핑계 만들기"와 실패한 시도는 세지 않는다. (DESIGN 1장)
  const [regenCount, setRegenCount] = useState(0);

  // 눌러 본 뒤에는 입력이 바뀔 때마다 다시 검사해서, 고친 칸의 안내가 바로 사라지게 한다.
  const validation = validateInput({ transport, minutes, relation });
  const errors = submitted && !validation.ok ? validation.errors : {};

  const remaining = LIMITS.maxRegenerate - regenCount;
  // 마지막으로 만든 때의 입력과 달라졌는지. 바꿨다가 같은 값으로 되돌리면 "안 바뀐 것"이다.
  // (입력이 비었거나 잘못된 상태도 "달라진 것"으로 본다)
  const inputChanged =
    lastInput !== null &&
    !(
      validation.ok &&
      validation.value.transport === lastInput.transport &&
      validation.value.minutes === lastInput.minutes &&
      validation.value.relation === lastInput.relation
    );
  // 5번을 다 썼고 입력도 그대로인 상태: "다시 만들기"도 "핑계 만들기"도 막는다. (제한을 우회하지 못하게)
  const exhausted = message !== null && remaining <= 0 && !inputChanged;
  const hint =
    message === null ? null : inputChanged ? HINT_INPUT_CHANGED : exhausted ? HINT_EXHAUSTED : null;

  async function handleSubmit() {
    setSubmitted(true);
    if (!validation.ok) return; // 입력이 잘못됐으면 여기서 멈춘다 (서버 요청도 보내지 않는다)
    if (working !== null) return; // 이미 만드는 중이면 한 번 더 보내지 않는다
    if (exhausted) return; // 5번을 다 썼으면 입력을 바꾸기 전까지 새로 만들지 않는다

    // 새 상황으로 만들기 시작: 이전 결과와 사유 기록을 모두 지운다
    setWorking("create");
    setMessage(null);
    setNotice(null);
    setReasons([]);

    const outcome = await requestExcuse(validation.value, []);

    if (outcome.ok) {
      setMessage(outcome.message);
      setLastInput(validation.value);
      setReasons([outcome.reasonCode]);
      setRegenCount(0); // 새 상황이니 남은 횟수를 5회로 되돌린다
    } else {
      setNotice(outcome.notice);
    }
    setWorking(null);
  }

  async function handleRegenerate() {
    if (working !== null || lastInput === null || message === null) return;
    if (exhausted || inputChanged) return; // 횟수를 다 썼거나 입력이 바뀌었으면 누를 수 없다

    // 직전 메시지는 화면에 그대로 둔 채 새 메시지를 요청한다. (실패해도 직전 메시지가 남는다)
    setWorking("regenerate");
    setNotice(null);

    const outcome = await requestExcuse(lastInput, reasons);

    if (outcome.ok) {
      setMessage(outcome.message);
      // 직전 사유는 최근 3개만 기억한다
      setReasons((previous) => [...previous, outcome.reasonCode].slice(-LIMITS.maxAvoidReasons));
      setRegenCount((count) => count + 1); // 성공한 경우에만 1회로 센다
    } else {
      setNotice(outcome.notice);
    }
    setWorking(null);
  }

  return (
    <>
      <ExcuseForm
        transport={transport}
        minutes={minutes}
        relation={relation}
        errors={errors}
        loading={working === "create"}
        disabled={working !== null || exhausted}
        onTransportChange={setTransport}
        onMinutesChange={setMinutes}
        onRelationChange={setRelation}
        onSubmit={handleSubmit}
      />
      <ExcuseResult
        message={message}
        notice={notice}
        regenerating={working === "regenerate"}
        remaining={remaining}
        regenerateDisabled={working !== null || exhausted || inputChanged}
        hint={hint}
        onRegenerate={handleRegenerate}
      />
    </>
  );
}
