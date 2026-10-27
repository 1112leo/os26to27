# OHSUNG 행사 사이트 개발본

`os26to27`은 개발·미리보기용 저장소입니다. 완성 후 필요한 파일을 실제 저장소에 옮깁니다. 지금은 **typing·write** 중심으로 작업하며 welcome은 기본 화면만 유지합니다.

## 수정 위치

| 위치                    | 내용                                   |
| ----------------------- | -------------------------------------- |
| `src/pages/typing.tsx`  | 타자 대회 화면                         |
| `src/pages/write.tsx`   | 편지 작성·접수 완료 화면               |
| `src/pages/welcome.tsx` | 신입생 환영 화면                       |
| `src/typing/`           | 문구·입력 판정·채점·기기 백업          |
| `src/admin/`            | 글·타자 기록·행사 설정·운영진 계정 관리 |
| `src/components/`       | 공통 화면·로그인·행사 상태             |
| `src/lib/`              | Firebase 연결·DB 작업·데이터 형식·검증 |
| `src/styles.css`        | 공통 스타일                            |
| `firebase/`             | Firestore 보안 규칙·인덱스             |

## 실행

관리자는 `/admin`에서 이메일·비밀번호로 로그인합니다. ‘글 관리’에서 추가·수정·삭제·검수, ‘타자 기록’에서 수기 추가·정정·삭제·상품 확인, ‘행사·문구 설정’에서 접수 개폐·문구·공개 상태를 관리합니다. ‘관리자 계정’에서는 내 이메일·비밀번호 변경, 운영진 추가·권한 해제를 처리합니다. 비밀번호는 조회하거나 Firestore에 저장하지 않습니다.

승인한 글은 공개용 사본에 별도로 저장되어 `/welcome`에 재배포 없이 반영됩니다. 공개 상태는 행사 설정에서 켭니다. 기존 버전에서 승인한 글은 ‘기존 승인 글 공개 반영’을 한 번 실행하세요. 문구 본문·연습 여부를 수정하면 새 버전이 생기며, 운영 설정에서 새 문구를 선택해야 참가 화면이 바뀝니다. 문구 삭제는 기존 기록을 보호하는 보관 방식이며 복원할 수 있습니다.

Node 24 이상을 사용합니다.

```powershell
npm ci
if (-not (Test-Path public/firebase-config.json)) {
  Copy-Item public/firebase-config.example.json public/firebase-config.json
}
# firebase-config.json에 사용할 Firebase 웹 앱 연결값을 입력합니다.
npm run dev
```

현재 PC의 실제 연결값은 `public/firebase-config.json`에 따로 보관하고 Git에서 제외합니다. 새 환경에서는 사용할 프로젝트의 설정을 넣습니다. `npm run build`로 빌드하고 `npm run preview`로 확인합니다.

## 실제 저장소로 옮길 때

- 앱: `src/`, `public/`, `index.html`.
- 실행·빌드: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `tools/build.mjs`. 기존 프로젝트에 설정이 있다면 필요한 부분만 합칩니다.
- DB: `firebase/`의 규칙·인덱스를 대상 프로젝트의 Firebase 설정에 연결합니다. 실제 연결값은 대상 환경에 맞게 준비합니다.
- `.github/workflows/pages.yml`은 이 개발 저장소의 자동 미리보기용입니다. 실제 저장소에는 옮기지 않습니다.

`.gitignore`는 필요한 경로만 허용합니다. 테스트·실험·생성물·운영 도구·이 저장소 전용 설정은 로컬에만 보관합니다. 새 파일이 꼭 필요하면 해당 경로만 허용 목록에 추가합니다. Firebase 공개 설정 양식에는 관리자 비밀번호나 서비스 계정 키를 넣지 않습니다.
