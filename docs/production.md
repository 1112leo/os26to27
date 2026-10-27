# os26to27 프로덕션

- 사이트: https://os26to27.pages.dev
- 저장소: https://github.com/1112leo/os26to27
- 프로덕션 브랜치: `main`
- 영문 학교 표기: `ohsung` / `OHSUNG`
- Pages 빌드: Node 24, `npm ci && npm test && npm run build`, 출력 `dist`
- `main` 푸시 시 Cloudflare Git 연동으로 앱을 자동 빌드·배포하며 GitHub Actions도 기능을 검증합니다.
- 보조 Worker는 동일 저장소의 Workers Builds에 연결했습니다. 관련 파일 변경 시 검증 후 `npm run deploy:gate`로 자동 배포합니다. Worker trigger: `26e67603-a747-46ff-a7f6-e229e3ef3ab2`.
- Pages project: `32056093-37c2-4bac-a5bf-f15c70dc623a`. 모든 자동 빌드는 Node 24를 사용합니다.
- 로그인 IP 제한은 5회/분 유지, 글 접수는 공용 IP당 600회/분으로 확대했습니다.
- 프로덕션 운영 단계는 A입니다. 애국가는 임시 연습 문구로 유지합니다.

## 데이터와 비밀정보

기존 프로덕션 D1 `416e12bb-7970-43df-84f7-fd0e0556e1f8`을 그대로 연결합니다. 실제 물리 이름 `osung-letters`와 브라우저의 과거 IndexedDB 키 `osung-typing`은 기록 보존을 위한 호환 식별자입니다. 새 공개 표기·쿠키·다운로드 파일은 `ohsung`입니다.

미리보기 D1은 `os26to27-preview` (`8034b06a-9356-4fad-901b-cb34c1cd0ee2`)로 분리합니다. 미리보기는 B 단계로 접수를 막고, 프로덕션 관리자 자격증명은 전달하지 않습니다. 새 프로덕션의 관리자 비밀번호는 기존 로컬 보관 파일을 유지하되 서명키는 새로 발급합니다.

`.dev.vars`, `artifacts/`, `backups/`는 Git에서 제외합니다. 프로덕션 비밀정보는 Cloudflare의 secret 환경변수에만 등록합니다. GitHub 저장소에는 비밀번호나 서명키를 포함하지 않습니다.

## 검증

- 자동 테스트 31개 통과, TypeScript 및 Vite 프로덕션 빌드 통과.
- 700자 글 2,000건을 격리된 로컬 D1에 저장한 뒤 마지막 페이지 조회·검색·전체 JSON 백업·승인된 1,000건 공개 내보내기 통과.
- D1의 LIKE 패턴 50바이트 제한을 피하도록 바인딩된 `instr` 검색으로 변경. 긴 한글 및 `%`, `_`, 따옴표가 포함된 검색 검증.
- 공개 글은 한 페이지에 20편씩 렌더링해 수천 개 글의 DOM을 한꺼번에 만들지 않습니다.
- 기존 채점·IME 모델·중복 접수·인증·원문 보존·복구·공개 파일 검증 테스트 유지.

## 실제 푸시 및 프로덕션 확인

2026-10-27, 첫 `main` 푸시 커밋 `b65fcd52ad6382f9dbce7e4b84720d1fee118c94`에서 다음 결과를 확인했습니다.

- GitHub Actions: [기능 검증 성공](https://github.com/1112leo/os26to27/actions/runs/40462503255).
- Cloudflare Pages: 배포 `86924dad-7070-4589-a254-23df82d4e2a0` 성공. 트리거는 `github:push`, 브랜치는 `main`, 배포 커밋은 위 SHA와 일치합니다.
- 새 사이트 HTTP 200, 운영 설정 A, 비인증 관리자 API 401.
- 새 HTTPS 주소에서 관리자 로그인·실제 D1 접수·같은 키 재시도·검수·원문 보존·공개/전체/CSV 내보내기·공개 제외·로그아웃 검증 통과.
- 검증용 원격 레코드만 ID·접수 키·검증 별명이 모두 일치하는 조건으로 정리했으며, 기존 글 건수는 유지했습니다.
- 브라우저에서 OHSUNG 표기 확인. 격리된 로컬 정적 서버에서 41편의 공개 글이 20/20/1편으로 나뉘고 마지막 페이지의 다음 버튼이 비활성화되는 것을 확인했습니다. 예제 데이터는 프로덕션에 게시하지 않았습니다.

## 보조 Worker 빌드 토큰 교체 필요

Workers Builds 연결과 푸시 트리거는 생성되어 첫 푸시에서 실행됐지만, 기존 Cloudflare 관리형 빌드 토큰이 삭제·회전되어 더 이상 유효하지 않다는 오류로 중단됐습니다. 실패 빌드 UUID: `34d5dd1b-0eb4-41af-ac33-3ddc981aa4d1`.

OAuth 연결은 사용자 API 토큰 생성 엔드포인트를 지원하지 않으며 계정 API 토큰 생성 권한도 제공되지 않아 자동으로 새 토큰을 만들 수 없습니다. Cloudflare 대시보드에서 `ohsung-rate-limiter → Settings → Builds → API token`에 새 빌드 토큰을 지정한 뒤 재실행해야 합니다. 기존의 다른 Worker 토큰을 회전하거나 삭제하지 마세요. 토큰 원문을 GitHub·채팅·저장소에 올릴 필요가 없습니다.

앱의 Pages 자동 배포는 이 보조 Worker 빌드와 독립적으로 성공했습니다. 현재 서비스에는 새 이름의 Worker와 600건/분 설정을 이미 직접 배포했습니다.

실제 물리 키보드 IME·Safari·인쇄 QR의 스마트폰 스캔은 행사 전 현장에서 확인해야 합니다.
