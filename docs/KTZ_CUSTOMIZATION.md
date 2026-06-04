# KTZ Launcher Customization Guide

이 문서는 KTZ 런처에서 서버 선택 화면에 표시할 서버 이름, 설명, 이미지 경로를 정리하기 위한 기준입니다.

## 1. 서버 이미지 파일 위치

런처 내부에 이미지를 직접 넣을 경우 아래 폴더를 사용합니다.

```text
app/assets/images/servers/
```

권장 파일명은 다음과 같습니다.

```text
app/assets/images/servers/katori_thumb.png
app/assets/images/servers/katori_bg.png
app/assets/images/servers/city_ability_thumb.png
app/assets/images/servers/city_ability_bg.png
app/assets/images/servers/minigame_thumb.png
app/assets/images/servers/minigame_bg.png
```

## 2. 권장 이미지 크기

```text
서버 카드 썸네일: 256 x 256 png
서버 큰 배경 이미지: 1280 x 720 png 또는 jpg
```

## 3. distribution.json 서버별 KTZ 필드

기존 서버 설정은 유지하고, 서버별 UI 정보만 `ktz` 필드에 추가합니다.

```json
{
  "id": "katori",
  "name": "카토리",
  "description": "카토리 서버",
  "icon": "assets/images/servers/katori_thumb.png",
  "version": "1.0.0",
  "address": "katori.example.com:25565",
  "minecraftVersion": "1.21.4",
  "mainServer": true,
  "autoconnect": true,
  "modules": [],
  "ktz": {
    "shortName": "카토리",
    "subtitle": "힐링 경제 서버",
    "thumbnail": "assets/images/servers/katori_thumb.png",
    "background": "assets/images/servers/katori_bg.png"
  }
}
```

## 4. 서버 3개 예시

```json
{
  "version": "1.0.0",
  "servers": [
    {
      "id": "katori",
      "name": "카토리",
      "description": "카토리 서버",
      "icon": "assets/images/servers/katori_thumb.png",
      "version": "1.0.0",
      "address": "katori.example.com:25565",
      "minecraftVersion": "1.21.4",
      "mainServer": true,
      "autoconnect": true,
      "modules": [],
      "ktz": {
        "shortName": "카토리",
        "subtitle": "힐링 경제 서버",
        "thumbnail": "assets/images/servers/katori_thumb.png",
        "background": "assets/images/servers/katori_bg.png"
      }
    },
    {
      "id": "city_ability",
      "name": "도시능력자",
      "description": "도시능력자 서버",
      "icon": "assets/images/servers/city_ability_thumb.png",
      "version": "1.0.0",
      "address": "city.example.com:25565",
      "minecraftVersion": "1.21.4",
      "mainServer": false,
      "autoconnect": true,
      "modules": [],
      "ktz": {
        "shortName": "도시능력자",
        "subtitle": "능력자 전투 서버",
        "thumbnail": "assets/images/servers/city_ability_thumb.png",
        "background": "assets/images/servers/city_ability_bg.png"
      }
    },
    {
      "id": "minigame",
      "name": "미니게임서버",
      "description": "미니게임 서버",
      "icon": "assets/images/servers/minigame_thumb.png",
      "version": "1.0.0",
      "address": "minigame.example.com:25565",
      "minecraftVersion": "1.21.4",
      "mainServer": false,
      "autoconnect": true,
      "modules": [],
      "ktz": {
        "shortName": "미니게임서버",
        "subtitle": "미니게임 통합 서버",
        "thumbnail": "assets/images/servers/minigame_thumb.png",
        "background": "assets/images/servers/minigame_bg.png"
      }
    }
  ]
}
```

## 5. 동작 흐름

```text
런처 실행
→ 로그인
→ 기존 landing 화면 진입
→ KTZ 서버 선택 화면이 자동으로 1회 표시
→ 서버 선택
→ 기존 landing 화면 복귀
→ 기존 PLAY 버튼으로 실행
```

기존 로그인, Java 검사, 파일 검증, 실행 구조는 그대로 사용합니다.
