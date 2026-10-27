# os26to27 · 천안오성고 행사 웹사이트

React + TypeScript + Vite, Cloudflare Pages Functions, D1으로 구현한 행사 운영 앱입니다. 타자 기록은 **현재 브라우저의 IndexedDB에만** 저장하고, D1에는 홍보 글과 검수 정보만 저장합니다. 시각 디자인 작업 전의 기본 CSS 버전입니다.

## 실행

Node.js 24를 사용합니다.

```powershell
npm ci
npm run admin:setup -- --local
npm run types
npm run db:local
npm run build
```

서로 다른 터미널에서 실행합니다. 요청 제한 Worker가 먼저 준비되어야 합니다.

```powershell
# 터미널 1: 로그인·제출 요청 제한 (Cloudflare 내부 서비스)
npm run dev:gate
```

```powershell
# 터미널 2: 전체 앱 + Pages Functions + 로컬 D1
npm run dev:api
```

`http://127.0.0.1:8788`에서 확인합니다. 프런트엔드 HMR이 필요하면 터미널 3에서 `npm run dev`를 실행하고 표시되는 Vite 주소로 접속합니다. API는 8788로 프록시됩니다. 정적 빌드 미리보기에서는 프런트 수정 후 `npm run build`와 브라우저 새로고침이 필요합니다.

`.dev.vars`는 로컬 비밀번호 해시와 세션 서명키를 보관하며 Git에서 제외합니다. 관리자 비밀번호를 변경하려면 기존 파일을 안전하게 별도 보관하고 로컬 설정을 다시 생성하세요. 테스트 목적으로 자동 생성한 경우에만 `artifacts/local-admin-password.txt`가 존재합니다. 실제 배포용 비밀번호는 별도로 정하세요.

## 경로

| 경로 | 기능 |
| --- | --- |
| `/` | 행사 안내 |
| `/typing` | 참가자 등록, 한글 타자, 결과 자동 저장 |
| `/typing/results` | 문구별 순위, 검색, 중복 참가 표시, 상품 수령, CSV·JSON 백업 |
| `/write` | 공개 동의를 받는 글 작성·중복 없는 접수 재시도 |
| `/write/complete` | 서버 저장 성공 후 접수 완료 |
| `/admin` | 서버 인증, 글 조회·검수, 공개용 편집·순서, 자료 내보내기 |
| `/welcome` | DB와 독립된 정적 공개 글 열람 |

## 확정된 채점 규칙

- 임시 문구: 애국가 1절과 후렴. **연습 기록**으로 저장하며 공식 결과와 구분합니다.
- 최초 입력 또는 한글 조합 시작부터 `performance.now()`로 측정합니다.
- 두벌식 글쇠 수: 초성 1타, 단모음 1타, 복합모음 2타, 단받침 1타, 겹받침 2타. Shift는 별도로 세지 않습니다. 공백과 문장부호는 각각 1타입니다.
- 현 문구 기준 145타. `challenge.ts`에 고정하고 테스트로 계산값을 검증합니다.
- 타수 = `Math.round(기준 타건 수 × 60000 / 소요 ms)`.
- 최종 점수 = `Math.max(0, 타수 - 누적 오타 × 20)`.
- 오타 수정 후에도 감점 유지. 조합 중 임시 값·정상 삭제·중복 input 이벤트는 추가 오타로 세지 않습니다.
- 점수 내림차순 → 오타 오름차순 → 시간 오름차순. 모두 같으면 공동 순위입니다.
- 붙여넣기·끌어놓기·자동 대체·입력 되돌리기를 차단합니다. 한글 IME 정상 확정 입력은 허용합니다.
- 탭 전환·창 포커스 이탈·페이지 이탈·새로고침은 미완료 시도를 무효 처리합니다.
- 저장 실패 시 다음 참가자로 진행하지 않고 저장 재시도·해당 결과 JSON 긴급 백업을 제공합니다.

`src/typing/challenge.ts`에서 공식 문구를 확정할 때 새로운 `challengeId`, `referenceKeystrokes`, `practice: false`를 함께 설정하세요. 채점 규칙 변경도 문구 버전에 포함해야 기존 순위와 섞이지 않습니다. 참가 횟수 제한과 상품 기준은 미확정입니다. 동일 참가번호 중복 기록은 삭제하거나 자동으로 최우수 기록만 채택하지 않습니다.

## 배포

프로덕션 주소는 **https://os26to27.pages.dev**, 저장소는 **https://github.com/1112leo/os26to27**입니다. 영문 학교 표기는 **OHSUNG / ohsung**입니다. 현 운영 단계는 A이며, 애국가 문구는 임시 연습용으로 구분합니다. 프로덕션 배포와 공식 대회 문구 확정은 별개입니다.

Cloudflare Pages의 GitHub 연동으로 `main` 푸시를 배포합니다. 빌드 명령은 `npm ci && npm test && npm run build`, 출력은 `dist`, Node는 24입니다. 테스트·타입 검사·공개 JSON 검증·빌드 중 하나라도 실패하면 새 버전은 게시되지 않습니다. GitHub Actions도 동일한 기능 검증을 수행합니다.

요청 제한용 `ohsung-rate-limiter`도 같은 저장소의 Workers Builds에 연결했습니다. 서버·공통 모듈·테스트·의존성·요청 제한 설정이 `main`에서 바뀌면 검증 후 `npm run deploy:gate`를 자동 실행합니다. Cloudflare가 관리하는 기존 배포 토큰을 참조하며 토큰 값을 저장소나 GitHub Secrets에 복사하지 않습니다. 수동 배포가 필요할 때만 로컬 CLI 인증을 사용합니다.

현재 앱의 Git 자동 배포는 검증 완료했습니다. **보조 Worker의 자동 배포는 기존 빌드 토큰 만료로 교체가 필요합니다.** Cloudflare의 `ohsung-rate-limiter → Settings → Builds → API token`에서 새 토큰을 선택한 뒤 실패한 빌드를 재실행하세요. 현재 프로덕션 Worker에는 600건/분 설정이 이미 배포되어 있으며, 이 토큰 문제는 이후 보조 Worker 변경의 자동 배포에만 영향을 줍니다.

프로덕션 D1은 기존 데이터 보존을 위해 UUID와 물리 이름 `osung-letters`를 유지합니다. 새 데이터베이스로 교체하거나 초기화하지 않습니다. 로컬 IndexedDB의 과거 식별자 `osung-typing`도 기록 보존을 위해 유지합니다. 이 두 저장소 식별자를 제외한 새 코드·다운로드 파일·인증 쿠키 등은 `ohsung` 표기를 사용합니다. 새 주소는 브라우저 저장소가 별개이므로 예전 시험 주소의 타자 기록은 CSV/JSON으로 별도 백업하세요.

브랜치 미리보기는 `os26to27-preview` D1에 격리하고 B 단계로 신규 접수를 차단합니다. 프로덕션 관리자 비밀정보를 미리보기에 복사하지 않습니다. CLI 수동 배포가 필요할 때는 먼저 `wrangler login`을 갱신하세요. 최초 시험 배포 기록은 `docs/verification.md`, 프로덕션 구성은 `docs/production.md`를 참고하세요.

배포 관리자용 임시 비밀번호는 Git에서 제외된 `artifacts/deployment-admin-password.txt`에만 보관합니다. 실제 운영 전 원하는 비밀번호로 새 해시와 서명키를 만들어 교체하세요. 이 파일과 `admin-secrets.json`은 외부에 공유하거나 저장소에 커밋하지 마세요.

Pages는 요청 제한 바인딩을 직접 지원하지 않으므로, 동일 Cloudflare 계정의 **공개 URL이 없는** `ohsung-rate-limiter` Worker를 서비스 바인딩으로 호출합니다. 별도 DB·KV·인증 서비스는 사용하지 않습니다. 로그인은 IP당 5회/분, 제출은 IP당 600회/분입니다. Cloudflare 기본 제한은 위치별 근사치이며 강한 전역 할당량은 아닙니다. 학교 공용 IP 참가량을 고려해 `wrangler.ratelimit.jsonc`에서 조정할 수 있습니다.

```powershell
npx wrangler login
npx wrangler d1 create osung-letters --location apac
# 반환된 database_id를 wrangler.jsonc의 DB 바인딩에 입력
npm run types
npm run db:remote
# Cloudflare Pages에서 GitHub 저장소를 연결해 프로젝트를 생성합니다.
# 현재 계정의 os26to27 프로젝트와 D1은 이미 구성되어 있으므로 중복 생성하지 않습니다.
npm run admin:setup
npx wrangler pages secret bulk artifacts/admin-secrets.json --project-name os26to27
npm run deploy
```

배포 인증정보를 코드나 VITE_ 환경변수에 넣지 마세요. 프로덕션은 HTTPS의 `__Host-`·HttpOnly·Secure·SameSite=Strict 서명 쿠키를 사용하며 세션은 8시간 만료됩니다. 로그아웃은 해당 브라우저 쿠키를 지웁니다. `SESSION_SECRET`을 바꾸고 재배포하면 기존 세션 전체가 무효화됩니다. 관리자 API는 매 요청마다 서명을 검증하며 POST/PATCH는 동일 Origin 검사로 보호합니다. 로컬 HTTP 쿠키는 별도 이름을 사용합니다.

초기 `database_id`가 0으로만 되어 있다면 로컬 개발용 자리표시자입니다. 반드시 실제 DB ID로 교체한 후 원격 마이그레이션을 적용해야 합니다. Pages 빌드 명령은 `npm ci && npm run types && npm run build`, 출력은 `dist`, Node 버전은 24입니다. Functions 배포가 필요한 경우 Wrangler Direct Upload를 사용하세요. 단순 대시보드 폴더 끌어놓기는 Functions를 배포하지 않습니다.

## 운영 단계

`wrangler.jsonc`의 `EVENT_PHASE`를 변경한 후 재배포합니다. 미설정·잘못된 값은 제출과 타자를 차단하는 B로 처리합니다.

| 값 | 운영 |
| --- | --- |
| A | 타자 참가·글 제출 허용, 관리자 검수 가능 |
| B | 타자·신규 제출 종료, 검수·백업 계속 가능 |
| C | 신규 참여 종료, 입학식 공개 운영 |

입학식 공개 데이터는 서버 DB와 분리되어 있으므로 `EVENT_PHASE`만 바꿔서 공개 파일을 생성하거나 삭제하지 않습니다. **C로 전환하기 전에는 실제 공개 JSON을 저장소에 포함하지 마세요.** 이미 배포된 정적 파일은 승인 취소만으로 바뀌지 않으며 재생성·재배포해야 합니다.

## 입학식 공개·QR

1. 관리자에서 글을 검토하고 승인·공개용 본문·순서를 저장합니다.
2. `입학식 공개 JSON`을 내려받습니다. 전체 백업 JSON은 공개하지 않습니다.
3. 아래 명령으로 검증 후 반영합니다. 실패하면 기존 파일을 유지하며 성공 시 이전 정상 파일을 `backups/`에 보관합니다.

```powershell
npm run publish:import -- "C:\경로\ohsung-public-2027-03-01.json"
npm run validate:public
npm run deploy
npm run qr -- https://확정된도메인/welcome
```

공개 JSON에는 `id`, `nickname`, 공개용 `content`, `order`만 허용하며 추가 필드·중복 ID·잘못된 문자를 검증합니다. 빌드 시에도 검증하여 오류 파일이 배포되지 않도록 합니다. QR은 PNG 1600px와 SVG로 `artifacts/`에 생성됩니다. 최종 도메인은 미확정이므로 현재 발급 이미지는 시험용으로만 취급하고, 주소 확정 뒤 실제 스마트폰으로 테스트하세요.

## 백업·복구

- 행사 종료 직후, 중요한 검수 후, 입학식 준비 완료 때 관리자 `전체 JSON 백업`을 내려받아 **DB·운영 브라우저와 다른 위치**에 보관합니다.
- IndexedDB는 별도입니다. 타자 기록의 버전별 CSV와 전체 JSON도 내려받으세요. 다른 기기 기록은 자동 합쳐지지 않습니다.
- D1 SQL 백업은 `npx wrangler d1 export osung-letters --remote --output backups/letters.sql`로 생성합니다. 타임 트래블만으로 수개월 보존을 대신하지 않습니다.
- 복구는 새 DB에 수행하고 검증한 뒤 DB 바인딩을 바꿉니다. 기존 DB를 먼저 지우지 마세요.

```powershell
# 관리자 전체 JSON에서 복구용 SQL 생성 (기존 파일 덮어쓰기 금지)
npm run backup:sql -- backups/ohsung-all.json backups/restore.sql
npx wrangler d1 create osung-letters-restored --location apac
# 별도 복구 설정 파일에 새 DB를 등록하고 migrations apply 실행
npx wrangler d1 execute osung-letters-restored --remote --file backups/restore.sql
```

복구 대상 DB에는 먼저 `migrations/0001_letters.sql`을 적용해야 합니다. 원본·검수 상태·접수키·날짜를 복원한 뒤 건수와 공개 JSON을 비교하세요. 공개 파일만 되돌릴 때는 `backups/welcome-*.json`을 `publish:import`로 반영하고 재배포하거나, Cloudflare Pages에서 이전 정상 배포로 롤백합니다.

## 검증

```powershell
npm test
npm run build
npm audit
```

테스트는 한글 조합 이벤트 모델, 채점·순위·CSV, IndexedDB 저장, 실제 로컬 D1을 사용한 제출·동시 재시도·검수·인증·오류·공개 필터, 백업 복구, 공개 파일 검증 실패 시 정상 버전 보존을 포함합니다. 실제 PC의 Chrome·Edge·Safari 한글 IME, 스마트폰 QR 접속, 실제 운영 기기의 포커스 정책은 행사 전에 별도 수동 검증이 필요합니다. 테스트 결과와 남은 항목은 `docs/verification.md`에 기록합니다.

## 미확정 항목

공식 타자 문구, 참가 횟수 제한, 상품 기준, 행사·입학식 날짜, 최종 사이트 이름·도메인, 글 길이·별명 정책의 최종 승인, 데이터 보유·삭제 시점은 운영진 결정이 필요합니다. 글 길이 10~700자와 기본 별명 ‘오성고 선배’는 명세의 잠정안으로 구현했으며, 날짜와 삭제 작업을 자동 실행하지 않습니다. Turnstile은 초기 버전에서 비활성입니다.
