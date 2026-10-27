# os26to27 · OHSUNG

천안오성고 행사 웹사이트의 **GitHub Pages + Firebase 시험 버전**입니다. React·TypeScript·Vite와 Firebase Authentication·Cloud Firestore를 사용합니다. 편지와 타자 결과를 DB에 저장하고 운영진 계정으로 여러 기기의 기록을 함께 관리합니다.

기존 `main`의 Cloudflare 사이트와 D1 데이터는 그대로 유지합니다. 이 버전은 `codex/github-pages-firebase` 브랜치에서 별도로 배포합니다. 실제 Firebase 프로젝트는 **`os20th`**, DB는 **서울(`asia-northeast3`) Standard**이며, 로컬에서는 별도의 `demo-ohsung` 에뮬레이터를 사용합니다.

| 페이지 | 기능 |
| --- | --- |
| `/` | 행사 메인 |
| `/typing` | 애국가 1절 연습, 한글 IME 판정, 자동 채점·DB 저장 |
| `/typing/results` | 운영진 전용 통합 기록·검증·순위·상품·CSV·재전송 |
| `/write` | 10~700자 편지 접수, 공개 동의·중복 저장 방지 |
| `/write/complete` | 서버 저장 확인 후 접수번호 안내 |
| `/admin` | 운영진 로그인, 편지 검수·검색·내보내기, 행사 단계 전환 |
| `/welcome` | 승인된 공개 JSON 열람, DB 장애와 독립 |

GitHub 프로젝트 페이지에서는 각 경로 앞에 `/os26to27`이 붙습니다. 빌드가 각 경로의 `index.html`을 생성하므로 직접 접속과 새로고침도 가능합니다.

## 로컬 실행

Node 24와 Java 21 이상이 필요합니다. 로컬 에뮬레이터는 Firebase 로그인이나 결제 연결 없이 실행됩니다.

```powershell
npm ci
Copy-Item .env.example .env.local
# 터미널 1
npm run emulators
# 터미널 2
npm run emulators:seed
npm run dev
```

로컬 관리자: `admin@ohsung.test` / `local-ohsung-2027`. **에뮬레이터 전용 공개 시험 계정**입니다. 시드 명령은 `demo-ohsung`과 loopback 주소를 고정하여 실제 프로젝트에 이 계정을 만들지 않습니다. 종료하면 에뮬레이터 데이터는 사라집니다.

```powershell
npm test
# 다른 에뮬레이터를 종료한 상태에서 실행
npm run test:rules
npm run build
```

Windows에서 종료한 Java 에뮬레이터가 포트를 계속 잡고 있으면 해당 터미널에서 종료하고 작업 관리자로 **그 에뮬레이터 프로세스만** 종료한 뒤 재실행하세요.

## Firebase 실서비스 연결

`os20th` 프로젝트의 익명·이메일/비밀번호 Auth, 승인 도메인, Firestore 규칙·인덱스와 최초 운영진을 구성했습니다. 관리자 계정의 초기 비밀번호는 저장소 밖 로컬 비공개 파일 `C:\Users\castl\.codex\private\os20th-admin.json`에 보관하며 Git에 포함하지 않습니다. 추가 환경을 만들 때는 아래 절차와 [docs/firebase.md](docs/firebase.md)를 따릅니다. 서버 키나 서비스 계정은 프런트엔드·GitHub 변수에 넣지 않습니다.

1. `os26to27`용 Firebase 프로젝트와 웹 앱을 만듭니다. Firestore **Standard / Native mode** DB의 위치는 생성 전에 결정합니다. 학교용 시험 운영은 Spark 요금제로 시작할 수 있으며 이 코드에는 유료 Cloud Functions가 없습니다.
2. Authentication에서 **익명 로그인**과 **이메일/비밀번호**를 켭니다. 실제 운영진 계정을 별도로 생성합니다. 자동 회원가입·자동 관리자 승격 화면은 제공하지 않습니다.
3. Firestore에 `admins/관리자UID` 문서를 `{ "enabled": true }`로 등록합니다. 이 작업은 신뢰할 수 있는 콘솔/Admin SDK에서만 가능합니다.
4. `npx -y firebase-tools@latest login` 후 실제 프로젝트를 명시적으로 선택·배포합니다. `os20th`는 `production` 별칭으로도 등록되어 있습니다.

```powershell
npx -y firebase-tools@latest deploy --project 실제프로젝트ID --only firestore,auth
```

5. Firebase 웹 앱의 공개 설정 JSON을 `public/firebase-config.json` 또는 GitHub 저장소 **Actions variable `FIREBASE_CONFIG`**에 등록합니다. `apiKey`, `projectId`, `appId`가 필수입니다. 공개 웹 설정 자체는 관리자 비밀키가 아닙니다. GitHub Pages 빌드는 변수 값이 있으면 공개 설정 파일을 생성합니다.
6. Auth의 승인 도메인에 `1112leo.github.io`를 등록합니다. 로컬 실서버 연결 시험 시 localhost도 별도 등록합니다. `.env.local`의 에뮬레이터 모드를 끕니다.
7. `/admin`에 로그인하고 **A · 행사 참여 허용**을 눌러 행사 설정과 현재 대회 문구를 등록합니다. 직접 편지·타자 기록 한 건을 제출하고 운영진 조회까지 확인합니다.

실제 프로젝트가 연결되지 않으면 저장 버튼을 열거나 저장 성공으로 표시하지 않습니다. 에뮬레이터에서 검증한 결과와 실서버 검증 결과를 구분합니다.

## GitHub Pages 자동 배포

`.github/workflows/pages.yml`은 `codex/github-pages-firebase` 푸시에서 단위 테스트, Firestore 규칙 테스트, 타입 검사, 공개 JSON 검증, 빌드를 통과한 뒤 GitHub Pages에 배포합니다. `main`은 기존 사이트 운영 브랜치로 유지합니다. GitHub Pages 설정은 Actions 방식이며, `github-pages` 환경에서 이 시험 브랜치 배포를 허용해야 합니다.

Firebase 규칙은 Git 푸시로 자동 변경하지 않습니다. DB 규칙 변경 시 위의 명시적 Firebase 배포를 진행합니다. GitHub 저장소에는 Firebase 관리자 자격증명이나 갱신 토큰이 필요하지 않습니다.

## 운영·공개·복구

- 점수는 두벌식 기준 타수 반올림에서 누적 오타당 20점을 빼고 **0점에서 하한 처리**합니다. 동점은 오타 수, 소요 시간 순이며 완전히 같으면 공동 순위입니다.
- 애국가 임시 문구는 연습 기록으로 표시하며 상품 수령을 차단합니다. 클라이언트의 시간 측정은 조작 가능하므로 결과는 **확인 대기**로 접수하고 운영진이 확인한 기록만 공식 순위로 사용합니다.
- 접수는 기록·접수증·기기별 제한 카운터를 원자적으로 저장합니다. 응답 유실 후 같은 접수번호·같은 내용으로 재시도해도 중복 생성하지 않습니다. 기기당 분당 600회로 제한합니다. IP별 전역 봇 차단은 아닙니다.
- 타자 기록은 IndexedDB에 먼저 보관하고 서버 확인 후 저장 완료로 표시합니다. 실패한 기록은 `/typing/results`에서 운영진이 재전송합니다. 접수 마감 후에도 운영진의 미전송 타자 기록 복구는 허용하며 확인 대기로 저장합니다. 옛 기기 DB 이름 `osung-typing`은 기록 보존을 위해 유지합니다. 다른 도메인의 IndexedDB에는 접근할 수 없습니다. 예전 Cloudflare 기기 기록은 그 주소에서 먼저 내보내세요.
- 관리자 **전체 JSON 백업**에는 편지 원문, 검수 상태, 타자 기록, 접수증, 행사·문구 설정이 들어갑니다. Auth 계정·관리자 역할·요청 제한 카운터는 제외합니다. 백업은 개인정보가 포함된 비공개 파일로 안전한 별도 위치에 보관합니다. 여러 컬렉션을 순차 조회하므로 제출 마감 후 백업하는 것이 좋습니다.
- 공개는 관리자의 **입학식 공개 JSON** → 아래 명령 → 커밋·시험 브랜치 푸시 순서입니다. 승인되지 않은 글이나 전체 백업 파일은 공개 빌드에 포함하지 않습니다.

```powershell
npm run publish:import -- 내려받은공개파일.json
npm run qr -- https://1112leo.github.io/os26to27/welcome
# 복구 미리보기: DB에 쓰지 않음
npm run backup:restore -- 비공개백업.json --project 비어있는복구프로젝트ID
# ADC/GOOGLE_APPLICATION_CREDENTIALS를 안전하게 준비한 뒤 실행
npm run backup:restore -- 비공개백업.json --project 비어있는복구프로젝트ID --execute
```

복구는 빈 대상에만 새 문서를 만들며 기존 자료를 덮어쓰지 않습니다. 중간 실패 시 부분 복구가 남을 수 있으므로 새 빈 대상에 다시 수행합니다. Auth 계정·관리자 역할과 보안 규칙은 별도로 복구합니다. 공개 JSON 이전 버전은 `backups/`에 보관됩니다.

과거 Cloudflare 설계·배포 기록은 `docs/specification.md`, `docs/production.md`, `docs/verification.md`에 역사 자료로 보존합니다. 이 브랜치의 현재 구현·설정은 이 README와 `docs/firebase.md`가 기준입니다.
