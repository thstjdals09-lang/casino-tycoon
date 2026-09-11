# Casino Tycoon 작업 메모

새 세션을 시작하면 아래 "진행 상황 로그"부터 읽고 이어서 작업할 것. 세션을 마칠 때는 맨 위에 날짜와 함께 새 항목을 추가한다 (무엇을 했는지 / 다음에 할 일).

## 진행 상황 로그

### 2026-09-11
- Vite + TypeScript + Phaser 3 스캐폴드 생성, Phaser 게임 설정(pixelArt, FIT 스케일).
- 핵심 방치형 루프 구현: `src/game/`에 매장 등급(balance.ts), 상태/액션(GameState.ts), localStorage 저장+오프라인 수익(SaveManager.ts).
- 매장 등급 4단계 정의: 구석 테이블 하나 → 동네 홀덤 매장 → 지역 카지노 → 국내 최고 카지노. 등급마다 테이블 수/매출/비용 곡선, 확장(프레스티지) 비용과 영구 배율 설정.
- `MainScene`에서 테이블 grid 렌더링(placeholder 사각형, 팀 색상), 탭하면 보너스 수금 + 플로팅 텍스트. 빈 다음 칸을 눌러도 테이블 구매 가능.
- `HUD`(DOM 오버레이)에서 테이블 강화/구매, 딜러 고용/교육/배정, 매장 확장 버튼 제공.
- Playwright로 실제 브라우저에서 구매→고용→배정→강화→프레스티지 전체 플로우 스크린샷 검증 완료 (핵심 루프 정상 동작 확인).
- **다음 할 일**: OpenGameArt 도트 에셋 조사 및 placeholder 교체(CREDITS.md 신설), Capacitor 모바일 패키징, 밸런스 수치 튜닝.

## 참고

- 기술 스택 선택: Phaser 3 + Capacitor (사용자가 직접 선택, 이유: 브라우저에서 바로 실행/스크린샷 검증 가능해 반복 개발이 빠름).
- 저장 포맷 버전은 `src/game/SaveManager.ts`의 `SAVE_VERSION`. 세이브 스키마(`GameSaveData`)를 바꿀 때는 버전을 올리고 마이그레이션 여부를 검토할 것.
