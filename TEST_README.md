# TDF Program Test Suite

이 문서는 TDF (Trading Data Feed) 프로그램의 포괄적인 테스트 스위트에 대한 설명입니다.

## 📋 테스트 구조

### 1. 기본 기능 테스트 (`tests/tdf.ts`)
- **Global State 초기화**: 프로그램의 전역 상태 초기화 테스트
- **Market 리스팅**: 마켓 등록 및 관리 테스트
- **League 생성**: 리그 생성 및 설정 테스트
- **League 참여**: 사용자의 리그 참여 테스트
- **통합 테스트**: 전체 워크플로우 테스트

### 2. Edge Cases 테스트 (`tests/tdf-edge-cases.ts`)
- **경계값 테스트**: 최대/최소값 처리 테스트
- **예외 상황**: 잘못된 입력값 처리 테스트
- **스트레스 테스트**: 동시 작업 및 대량 데이터 처리 테스트
- **메모리 사용량**: 대용량 데이터 구조 처리 테스트

### 3. 성능 테스트 (`tests/tdf-performance.ts`)
- **트랜잭션 성능**: 개별 작업의 실행 시간 측정
- **대량 작업**: 여러 사용자의 동시 참여 테스트
- **순차 vs 병렬**: 작업 실행 방식별 성능 비교
- **리소스 사용량**: 메모리 및 CPU 사용량 최적화 테스트

## 🚀 테스트 실행 방법

### 기본 실행
```bash
# 모든 테스트 실행
yarn test

# 또는
yarn run test:runner all
```

### 개별 테스트 실행
```bash
# 기본 기능 테스트만
yarn test:basic

# Edge cases 테스트만
yarn test:edge

# 성능 테스트만
yarn test:performance
```

### 테스트 러너 사용
```bash
# 도움말 보기
yarn run test:runner help

# 특정 테스트 타입 실행
yarn run test:runner basic
yarn run test:runner edge-cases
yarn run test:runner performance
yarn run test:runner all
```

## 📊 테스트 결과 해석

### 성공적인 테스트 실행
```
✅ Basic functionality tests completed successfully in 45.23s
✅ Edge cases tests completed successfully in 78.91s
✅ Performance tests completed successfully in 156.78s
```

### 실패한 테스트 실행
```
❌ Basic functionality tests failed after 30.45s
❌ Edge cases tests failed after 60.12s
```

## 🔧 테스트 설정

### 타임아웃 설정
- **기본 테스트**: 5분 (300초)
- **Edge Cases**: 10분 (600초)
- **성능 테스트**: 15분 (900초)
- **전체 테스트**: 20분 (1200초)

### 필수 조건
1. Solana 로컬 클러스터 실행 중
2. Anchor 프로그램 빌드 완료
3. 필요한 의존성 설치 완료

## 📈 성능 기준

### 트랜잭션 실행 시간
- **Global State 초기화**: < 5초
- **Market 리스팅**: < 10초
- **League 생성**: < 15초
- **League 참여**: < 10초

### 대량 작업 성능
- **10명 동시 참여**: < 60초
- **병렬 작업**: 순차 작업 대비 30% 이상 빠름
- **대용량 데이터**: 10개 마켓 처리 < 20초

## 🐛 문제 해결

### 일반적인 오류
1. **"already in use"**: 이미 초기화된 상태에서 재초기화 시도
2. **"constraint"**: 권한이 없는 사용자의 작업 시도
3. **"InsufficientEntryAmount"**: 최소 참여 금액 미달

### 디버깅 팁
1. 로그 메시지 확인: `console.log` 출력 확인
2. 트랜잭션 시그니처 확인: 실패한 트랜잭션 추적
3. 계정 상태 확인: PDA 및 계정 데이터 검증

## 📝 테스트 커버리지

### 기능 커버리지
- ✅ Global State 관리
- ✅ Market 등록 및 관리
- ✅ League 생성 및 관리
- ✅ 사용자 참여 및 입금
- ✅ 권한 검증
- ✅ 에러 처리

### 시나리오 커버리지
- ✅ 정상적인 워크플로우
- ✅ 권한 없는 접근
- ✅ 잘못된 입력값
- ✅ 동시 작업
- ✅ 대용량 데이터
- ✅ 경계값 처리

## 🔄 지속적 통합

### CI/CD 파이프라인
```yaml
# 예시 GitHub Actions 설정
- name: Run Tests
  run: |
    yarn install
    yarn test:basic
    yarn test:edge
    yarn test:performance
```

### 테스트 자동화
- 코드 변경 시 자동 테스트 실행
- 성능 회귀 감지
- 코드 품질 모니터링

## 📚 추가 리소스

- [Anchor 문서](https://www.anchor-lang.com/)
- [Solana 개발자 가이드](https://docs.solana.com/)
- [SPL Token 프로그램](https://spl.solana.com/token)

## 🤝 기여하기

테스트 개선을 위한 제안사항:
1. 새로운 Edge Case 추가
2. 성능 테스트 확장
3. 테스트 자동화 개선
4. 문서화 업데이트

---

**참고**: 이 테스트 스위트는 TDF 프로그램의 안정성과 성능을 보장하기 위해 설계되었습니다. 모든 테스트가 통과해야 프로덕션 환경에 배포할 수 있습니다.
