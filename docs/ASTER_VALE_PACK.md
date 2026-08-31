# 에스터베일 클라이언트팩 관리

에스터베일의 기준 클라이언트는 로컬 Modrinth 프로필 `NeoForge 1.21.4`입니다.
런처용 팩은 이 프로필과 이전 배포 목록을 비교해서 생성하며, 전체 팩이 설치될 때
관리 대상인 `mods`, `config`, `resourcepacks`, `emotes` 폴더를 정확히 교체합니다.

## 관리 범위

- `mods` 최상위의 모든 JAR
- 게임 플레이와 성능에 필요한 선별된 설정 파일
- `resourcepacks` 최상위의 모든 ZIP
- `emotes` 안의 모든 Emotecraft `.emotecraft` 파일

다음 항목은 사용자별 데이터 또는 용량이 큰 캐시이므로 배포하지 않습니다.

- `options.txt`, 계정·서버·월드·로그 데이터
- 음성 채팅 장치 및 볼륨 같은 개인 설정
- Dream Displays의 영상 및 썸네일 캐시
- 셰이더팩과 사용자의 셰이더 선택 상태
- 모드 폴더 안의 백업 디렉터리

## 새 버전 만들기

Node.js 22 환경에서 다음 명령을 실행합니다.

```console
npm run pack:astervale -- --version 1.1.0
```

결과는 `E:\Codex\Builds\KTZ-AsterVale\1.1.0`에 생성됩니다.

```text
astervale-client-pack-1.1.0.zip
pack/
```

명령은 이전 `docs/packs/astervale-files.json`과 현재 Modrinth 프로필을 SHA-256으로
비교해 `Added`, `Removed`, `Changed` 목록을 출력하고 다음 두 파일을 갱신합니다.

```text
docs/packs/astervale.json
docs/packs/astervale-files.json
```

## 배포 원칙

- 이미 배포한 ZIP을 덮어쓰지 않고 버전별 Release를 새로 만듭니다.
- ZIP을 Release에 올린 뒤 매니페스트 변경을 커밋합니다.
- 런처는 버전·크기·SHA-256을 검사한 뒤 임시 폴더에서 새 팩을 준비합니다.
- 검증이 성공해야 기존 팩과 교체하며 실패하면 기존 팩을 복구합니다.
- 소규모 긴급 수정은 매니페스트의 `livePatch`로 파일 추가·변경·삭제가 가능합니다.

사용자가 “에스터베일 모드팩 업데이트해줘”라고 요청하면 이 절차로 현재 Modrinth
프로필과 기존 배포본을 비교하고 추가·제거·변경 내용을 확인한 뒤 새 버전을 만듭니다.
