# os26to27

GitHub Pages + Firebase. HTML·CSS·JavaScript를 직접 수정합니다. 설치·빌드 과정은 없습니다.

- `typing/`: 타자 대회. 관리자 `/typing/admin/`.
- `write/`: 글 작성. 관리자 `/write/admin/`.
- `welcome/`: 승인 글 조회. 기본 기능만 구현.

루트 `/`에는 페이지가 없습니다. 공통 파일은 루트에 둡니다.

| 파일                                                         | 용도                     |
| ------------------------------------------------------------ | ------------------------ |
| `firebase.js`                                                | Firebase 연결·인증       |
| `database.js`                                                | DB 작업·검증·내보내기    |
| `common.js`                                                  | 입력 검증·파일·공통 함수 |
| `admin.js`                                                   | 관리자 화면              |
| `style.css`                                                  | 기본 스타일              |
| `firebase-config.json`                                       | 공개 웹 SDK 설정         |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json` | DB 규칙·배포 설정        |

로컬 실행: Node 24 이상에서 `node serve.mjs`. `http://127.0.0.1:5176/write/` 또는 `/typing/`으로 접속합니다. 에뮬레이터 검증 시 해당 주소에 `?emulator=1`을 붙입니다. 이 옵션은 로컬 주소에서만 작동합니다.

관리자 이메일·비밀번호로 로그인한 뒤 글·기록 추가/수정/삭제, 접수 설정, 문구 변경, 공개 승인, 계정과 권한 관리를 처리합니다. 공개된 글은 별도 재배포 없이 갱신됩니다. 문구 본문 변경은 새 버전으로 저장해 이전 기록의 채점 기준을 유지합니다.

GitHub Pages는 `main` 브랜치의 루트를 직접 배포합니다. 푸시하면 자동 반영됩니다. 다른 저장소로 옮길 때는 이 파일들과 세 폴더를 복사하고, 대상 Firebase 프로젝트의 공개 SDK 설정과 보안 규칙을 연결합니다. `firebase-config.json`은 공개되는 클라이언트 설정입니다. 관리자 비밀번호·서비스 계정 키는 넣지 않습니다.

인증 메일 처리 화면은 `/write/admin/action.html`입니다. 비밀번호 재설정·이메일 확인·이메일 변경·이메일 복구를 처리하며, 메일 URL의 `apiKey` 대신 사이트의 SDK 설정을 사용합니다. Firebase가 템플릿 작업 URL 변경을 `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`로 거부하여 현재는 관리자 로그인 화면의 ‘메일 링크로 비밀번호 설정’에서 받은 링크를 입력합니다. 추후 제한이 해제되면 이메일 템플릿 작업 URL을 이 화면으로 설정할 수 있습니다.

테스트·이전 소스·설치 파일·로그는 프로젝트 밖의 개발 보관 폴더에 둡니다.
