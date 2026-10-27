# OHSUNG 행사 사이트 개발본

`os26to27`은 개발·미리보기용 저장소입니다. 완성 후 필요한 파일을 실제 저장소에 옮깁니다. 지금은 **typing·write** 중심으로 작업하며 welcome은 기본 화면만 유지합니다.

## 수정 위치

| 위치 | 내용 |
| --- | --- |
| `src/pages/typing.tsx` | 타자 대회 화면 |
| `src/pages/write.tsx` | 편지 작성·접수 완료 화면 |
| `src/pages/welcome.tsx` | 신입생 환영 화면 |
| `src/typing/` | 문구·입력 판정·채점·기기 백업 |
| `src/admin/` | 운영진 검수·기록 관리·자료 내보내기 |
| `src/components/` | 공통 화면·로그인·행사 상태 |
| `src/lib/` | Firebase 연결·DB 작업·데이터 형식·검증 |
| `src/styles.css` | 공통 스타일 |
| `firebase/` | Firestore 보안 규칙·인덱스 |

## 실행

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
