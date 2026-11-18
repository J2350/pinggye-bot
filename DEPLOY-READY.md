# 핑계봇 배포 준비 확인 (PLAN 작업 14번 · Part 5 사전 확인)

> 확인일: 2026-11-17 · AI 서비스를 Claude에서 OpenAI로 교체한 뒤의 상태로 갱신했다.
> 이 문서를 쓸 때는 배포 전이었고, 이후 **미리보기 배포를 했다.** 그 기록은 5장에 있다.

## 한 줄 결론

코드는 올릴 준비가 됐다. **Vercel에 등록할 값은 `OPENAI_API_KEY` 하나뿐**이다.
배포 전에 직접 해야 할 일은 ① OpenAI 계정의 월 사용 한도 확인, ② 배포 방식(운영/미리보기) 선택, ③ 배포 뒤 Vercel 함수 대기 시간 설정 확인이다.

## 1. Vercel에 등록할 환경변수

코드가 읽는 환경변수는 [lib/ai.ts](lib/ai.ts) 한 곳의 `process.env.OPENAI_API_KEY`뿐이다. (소스 전체 검색 결과)

| 이름 | Vercel에 등록? | 이유 |
|------|:--------------:|------|
| `OPENAI_API_KEY` | ✅ 등록 | 서버가 OpenAI를 부를 때 쓰는 열쇠 (서버 코드에서만 읽음) |
| `VERCEL_TOKEN` | ❌ 등록 안 함 | 내 컴퓨터의 Vercel CLI가 배포할 때 쓰는 인증용. 앱은 읽지 않음 |
| `GITHUB_TOKEN` | ❌ 등록 안 함 | 앱이 읽지 않음 |
| `SUPABASE_ACCESS_TOKEN` | ❌ 등록 안 함 | 앱이 읽지 않음 (이 앱은 데이터베이스를 쓰지 않음) |

- 이름이 `NEXT_PUBLIC_`로 시작하는 변수는 쓰지 않는다. (브라우저에 노출되기 때문)
- 값은 이 문서나 채팅에 적지 않는다. `.env`에서 읽어 CLI로 전달한다. (CLAUDE.md 4장)

## 2. 지금 준비된 상태

| 확인 | 결과 |
|------|:----:|
| `npm run lint` · `npm run build` 오류 0개 | ✅ |
| 진짜 OpenAI 호출 점검 ([CHECK-RESULT.md](CHECK-RESULT.md)): 규칙 통과, 평균 1.4초 | ✅ |
| 운영용 서버(`next start`)로 실행: 첫 화면 200, 잘못된 입력 400, 키 없음 500 `SERVER_CONFIG`, GET 405, 없는 주소 404 (Claude 버전에서 확인, 서버 구조는 같음) | ✅ |
| 브라우저로 나가는 파일에 API 키·SDK·지시문·모델 이름이 없음 | ✅ |
| 운영에 쓰이는 패키지의 보안 취약점 (`npm audit --omit=dev`, OpenAI 도구 설치 후 다시 확인) | ✅ 0건 |
| `.gitignore`에 `.env*`, `/node_modules`, `/.next/`, `/trash-can/`, `.vercel` | ✅ |
| 저장소에 커밋 (비밀 값·`.env` 미포함 확인) | ✅ |
| Vercel CLI가 `.env`의 `VERCEL_TOKEN`으로 로그인됨 (작성자 계정) | ✅ 읽기만 확인 |
| `vercel.json` 등 별도 배포 설정 파일 | 필요하지 않음 |

참고: 개발 도구(devDependencies)에는 보안 경고 7건(moderate)이 있다. 운영 코드에는 들어가지 않으며 손대지 않았다.

## 3. 배포 전에 직접 해야 할 일

- [ ] **OpenAI 계정에서 월 사용 한도(결제 한도) 확인** — PRD 7장은 앱에 사용 횟수 제한을 넣지 않고 AI 서비스 쪽 월 한도로 요금을 막기로 했다. 내 계정에서만 할 수 있어서 대신 확인할 수 없다.
- [ ] **배포 주소를 아무에게나 알리지 않기** — 배포하면 주소를 아는 누구나 `/api/excuse`를 호출할 수 있다. 앱에는 로그인도 횟수 제한도 없다(PRD 범위). 월 한도가 유일한 요금 안전장치이고, "링크는 작성자만 사용"이라는 PRD 전제는 주소를 숨겨야 지켜진다.
- [ ] **배포 방식 선택** — 운영(production) 배포 / 미리보기(preview) 배포. (선택은 채팅에서 안내)

## 4. 배포할 때 확인할 것

### Vercel 함수 대기 시간
서버 창구는 AI 호출 1번당 최대 10초, 재시도까지 **최대 약 20초**를 기다린다. 실제로는 평균 1.4초라 보통은 한참 짧다. (화면은 30초까지 기다림)

조사한 내용 ([Vercel 문서](https://vercel.com/docs/functions/configuring-functions/duration.md)):
- **Fluid compute가 켜져 있으면** 기본 대기 시간이 모든 요금제에서 300초이고, 무료(Hobby) 요금제의 최대도 300초다.
- **Fluid compute가 꺼진 프로젝트**는 옛 기본값을 쓰며, 한 안내서에 무료 요금제 10초, Pro 15초로 적혀 있다. 이 경우 AI 응답이 느려 재시도까지 가면 대기 시간 초과(504)가 날 수 있다.

→ 배포한 뒤 Vercel 프로젝트 설정에서 **Fluid compute가 켜져 있는지** 확인한다. 꺼져 있다면 켜거나, 서버 창구 파일에 대기 시간을 늘리는 설정(`maxDuration`)을 추가한다. (새 프로젝트의 기본 설정이 무엇인지는 직접 확인하지 못했다.)

### 배포 절차 (CLAUDE.md 규칙 그대로)
1. Vercel CLI를 `.env`의 `VERCEL_TOKEN`으로 인증한다. 토큰 값은 묻거나 출력하지 않는다.
2. Vercel 프로젝트에 `OPENAI_API_KEY`를 등록한다. (값은 `.env`에서 읽어 전달, 출력 금지)
3. 배포하고, 받은 주소에서 CHECK-RESULT.md의 핵심 점검(메시지 생성·다시 만들기·복사)을 한 번 더 한다.
4. 배포는 외부에 공개되는 작업이라, 실행 전에 선택(운영/미리보기)을 확인받는다.

## 5. 배포 기록 (2026-11-17, 미리보기 먼저)

- **프로젝트:** 작성자의 Vercel 팀 아래 `my-app` (토큰의 기본 스코프)
- **환경변수:** `OPENAI_API_KEY` → **Preview 환경에만**, 비밀 값(Secret)으로 등록. Production에는 아직 없음.

| 배포 | 주소 | 환경 | 결과 |
|------|------|------|------|
| ① 첫 배포 | (주소 생략) | **운영(production)** | Vercel이 프로젝트의 첫 배포를 자동으로 운영으로 지정함 (미리보기로 의도했지만 그렇게 됨). 키가 없어 AI 요청은 `SERVER_CONFIG`. **화면은 로그인 없이 누구나 열림** |
| ② 미리보기 | (주소 생략) | 미리보기 | 메시지 생성 실패(`GENERATION_FAILED`) — 아래 "배운 점" 참고 |
| ③ 미리보기 (최신) | (주소 생략) | 미리보기 | ✅ 정상. Vercel 서버에서 진짜 OpenAI로 메시지 생성 3/3 성공, 잘못된 입력 400, 화면 200 |

- **접근 보호:** 미리보기 주소는 Vercel 로그인 없이는 막힌다(화면 302, API 401). 운영 주소(①)는 막히지 않는다.
- **배운 점 (②의 원인):** PowerShell로 키를 파이프해서 등록하면 끝에 줄바꿈이 남아 인증 헤더가 잘못돼, AI 호출이 즉시 `TypeError`로 실패했다. 키를 `--value`로 넘겨 다시 등록하고 재배포하니 해결됐다. 앞으로 환경변수를 CLI로 등록할 때는 `--value`를 쓴다.
- **자동으로 생겼다가 정리한 것:** 점검에 쓴 `vercel curl`이 프로젝트에 "보호 우회 키"를 자동으로 만들었다. 점검 후 해제했고 남은 우회 키는 0개다. (해제 전, 키 값이 대화 출력에 한 번 노출됐으나 이미 무효화됨)
- **로컬에 생긴 파일:** `.vercel/`(프로젝트 연결 정보), `.env.local`(Vercel 임시 인증 토큰 — 커밋·업로드 대상 아님), `.vercelignore`(업로드 제외 목록, 커밋함). `.gitignore`에는 CLI가 `.vercel`, `.env*` 줄을 덧붙였다.

### 운영으로 올리려면 (아직 안 함)
1. 위 3장 체크리스트 확인 (OpenAI 월 사용 한도, 주소 비공개 유지)
2. Production 환경에도 `OPENAI_API_KEY` 등록 (`--value` 사용)
3. `vercel deploy --prod`
4. **운영 주소는 로그인 없이 누구나 접속할 수 있으므로**, 키를 등록하는 순간부터 주소를 아는 누구나 요금을 쓸 수 있다. 운영 주소에도 로그인 보호를 걸 수 있는지 먼저 확인하는 것을 권한다. (이 계정·요금제에서 가능한지는 확인하지 못했다.)
5. 불필요해진 첫 운영 배포(①)를 지울지 정한다. (삭제는 되돌릴 수 없어 말씀 없이 하지 않음)

## 출처

- [Configuring Maximum Duration for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/duration.md)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
