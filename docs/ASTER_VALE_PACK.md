# 에스터베일 클라이언트팩 관리

에스터베일의 기준 클라이언트는 로컬 Modrinth 프로필 `NeoForge 1.21.4`입니다.
기본 경로는 `%APPDATA%\ModrinthApp\profiles\NeoForge 1.21.4`입니다.
런처용 팩은 이 프로필과 이전 배포 목록을 비교해서 생성합니다. `mods`는 교체하고,
`config`, `resourcepacks`, `emotes`, `shaderpacks`는 이전 관리 파일을 갱신하면서 사용자 파일을 보존합니다.

## 관리 범위

- `mods` 최상위의 모든 JAR
- 게임 플레이와 성능에 필요한 선별된 설정 파일
- `resourcepacks` 최상위의 모든 ZIP
- `emotes` 안의 모든 Emotecraft `.emotecraft` 파일
- `shaderpacks` 최상위의 ZIP과 해당 ZIP의 옵션 파일
- Modrinth에서 활성화한 리소스팩 순서와 셰이더 선택

다음 항목은 사용자별 데이터 또는 용량이 큰 캐시이므로 배포하지 않습니다.

- `options.txt`, 계정·서버·월드·로그 데이터
- 음성 채팅 장치 및 볼륨 같은 개인 설정
- Dream Displays의 영상 및 썸네일 캐시
- 모드 폴더 안의 백업 디렉터리

## 새 버전 만들기

Node.js 22 환경에서 다음 명령을 실행합니다.

```console
npm run pack:astervale -- --version 1.4.1
```

결과는 `C:\codex\Builds\KTZ-AsterVale\1.4.1`에 생성됩니다.
`--profile`과 `--output-root`로 경로를 지정할 수 있으며 빌드 경로는 `C:\codex\Builds` 아래여야 합니다.
이미 존재하는 버전 폴더는 덮어쓰지 않습니다.

```text
astervale-client-pack-1.4.1.zip
pack/
```

명령은 이전 `docs/packs/astervale-files.json`과 현재 Modrinth 프로필을 SHA-256으로
비교해 `Added`, `Removed`, `Changed` 목록을 출력하고 다음 두 파일을 갱신합니다.

```text
docs/packs/astervale.json
docs/packs/astervale-files.json
```

기준 프로필의 이모트 폴더가 비어 있는 경우에만 `--preserve-emotes <기존 인스턴스의 emotes 경로>`로
이전 배포 목록에 있던 파일을 유지할 수 있습니다. 이전 SHA-256과 일치해야 하며 임의 파일을 포함하지 않습니다.
가능하면 사용자가 승인한 이모트를 기준 Modrinth 프로필에 먼저 추가합니다.

## 배포 원칙

- 이미 배포한 ZIP을 덮어쓰지 않고 버전별 Release를 새로 만듭니다.
- ZIP을 Release에 올린 뒤 매니페스트 변경을 커밋합니다.
- 배포 전 `npm run test:astervale`, `npm run test:neoforge-managed-pack`을 실행하고 ZIP의 전체 파일·크기·SHA-256을 확인합니다.
- `distribution.json`의 `astervale` 버전도 새 팩 버전과 맞춥니다.
- 런처는 버전·크기·SHA-256을 검사한 뒤 임시 폴더에서 새 팩을 준비합니다.
- 검증이 성공해야 기존 팩과 교체하며 실패하면 기존 팩을 복구합니다.
- 소규모 긴급 수정은 매니페스트의 `livePatch`로 파일 추가·변경·삭제가 가능합니다.
- 음성 채팅과 `config/pastelpocket-client.properties`는 기존 개인 설정을 보존합니다.
- 팩 배포와 실제 서버 접속·게임 플레이 검증은 별도로 기록합니다.

2026-10-31의 1.4.0은 후속작 Modrinth 프로필의 모드 29개, 설정 18개,
리소스팩 6개, 셰이더 2개와 사용자 지정 이모트 32개를 포함합니다.
UniversalShop 0.6.0을 포함하며 서버 실행이나 재시작은 이 배포 절차에 포함하지 않습니다.

사용자가 “에스터베일 모드팩 업데이트해줘”라고 요청하면 이 절차로 현재 Modrinth
프로필과 기존 배포본을 비교하고 추가·제거·변경 내용을 확인한 뒤 새 버전을 만듭니다.
