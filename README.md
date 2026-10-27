# OHSUNG 행사 사이트

타자 대회와 후배에게 보내는 편지 사이트입니다. 지금은 **typing·write**를 중심으로 개발하고, welcome은 기본 화면만 유지합니다. React·TypeScript·Firebase를 사용합니다.

## 어디를 수정하나요?

```text
src/
  pages/
    typing.tsx          타자 대회 화면
    write.tsx           편지 작성·접수 완료 화면
    welcome.tsx         신입생 환영 화면
  typing/
    challenge.ts        대회 문구·문구 ID·연습 여부
    engine.ts           한글 조합·입력·오타 판정
    scoring.ts          타수·점수·동점 순위
    storage.ts          기기 백업·DB 전송·실패 재시도
  admin/
    index.tsx           편지 검수·행사 단계·자료 내보내기
    typing.tsx          운영진 타자 기록·상품 관리
    export.ts           비공개 백업·공개 JSON 생성
  components/           공통 화면·로그인·행사 상태
  lib/
    firebase.ts         Firebase 연결·인증·오류 처리
    database.ts         편지·타자·행사 설정 DB 작업
    types.ts            데이터 형식
    validation.ts       입력 검증
    files.ts            다운로드·CSV
    public-data.ts      공개 글 필터·공개 JSON 검증
    useLeaveGuard.ts    작성 중 이동 방지
  main.tsx              주소와 화면 연결
  styles.css            공통 스타일
firebase/               Firestore 보안 규칙·인덱스
public/                 공개 Firebase 설정·승인된 welcome 자료
tools/                  빌드·공개 자료 반영·백업 복구
```

화면 문구·배치는 `pages/`, 타자 규칙은 `typing/`, 저장 방식은 `lib/database.ts`에서 수정합니다. 실제 DB 호출은 Firebase 함수를 직접 사용합니다. 별도 API 서버나 `/api` 라우터는 없습니다.

## 로컬 개발

Node 24 이상이 필요합니다. 로컬 DB는 Java 21 이상도 필요합니다.

```powershell
npm ci
Copy-Item .env.example .env.local
# 터미널 1: 로컬 DB
npm run emulators
# 터미널 2: 로컬 운영진 등록 후 실행
npm run emulators:seed
npm run dev
```

로컬 운영진은 `admin@ohsung.test` / `local-ohsung-2027`입니다. `.env.local`의 `VITE_FIREBASE_EMULATORS=true`는 로컬 DB를 사용하고, `false`는 실제 `os20th` DB에 연결합니다. 비밀번호·서비스 계정 파일은 Git에 넣지 않습니다.

## 빌드·배포

```powershell
npm run build
npm run preview
```

`codex/github-pages-firebase` 브랜치에 푸시하면 빌드 후 [GitHub Pages](https://1112leo.github.io/os26to27/)로 자동 배포됩니다. 타입 검사와 공개 JSON 검증은 빌드에 포함됩니다. `/typing`, `/write`, `/welcome`, `/admin`, `/typing/results`에 직접 접속할 수 있습니다. 기존 Cloudflare 사이트와 `main` 브랜치는 유지합니다.

Firebase 프로젝트는 **`os20th`**, DB는 **서울 Standard**입니다. 보안 규칙·Auth 설정을 바꾼 경우 Firebase 소유자 로그인 후 `npm run firebase:deploy`로 별도 반영합니다. 웹 앱 공개 설정은 `public/firebase-config.json`에 있습니다.

## 자료 관리

- `/admin`에서 편지를 검수하고 전체 JSON·CSV·공개용 JSON을 내려받습니다. 원문과 타자 기록은 운영진만 조회합니다.
- 공개용 JSON 반영: `npm run publish -- 승인된공개자료.json` → 커밋·푸시. 전체 백업은 공개 파일로 사용할 수 없습니다.
- 비공개 백업 복구: `npm run restore -- 백업.json --project 빈복구프로젝트ID`. 먼저 미리보기만 실행하며 `--execute`를 붙이면 빈 대상에 복구합니다. 실행에는 Admin SDK 자격증명(`GOOGLE_APPLICATION_CREDENTIALS` 등)이 필요합니다. Auth 계정·운영진 역할은 별도로 설정합니다.
- 문구·채점 기준을 바꾸면 `typing/challenge.ts`의 문구 ID도 바꿉니다. 기존 기록과 새 기록은 버전별로 구분합니다. 애국가 문구는 현재 연습용이며 점수 하한은 0점입니다.
- 테스트·실험·과거 문서는 `.local/`에만 보관하고 커밋하지 않습니다.
