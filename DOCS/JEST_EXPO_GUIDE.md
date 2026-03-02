# Jest-Expo 및 Babel/TS-Jest 호환성 가이드

`fast-lint-mcp` (quality-check) 사용 중 `jest-expo` 프리셋 환경에서 `ReferenceError` 또는 설정 충돌이 발생하는 경우 아래 가이드를 참조하세요.

## 1. 주요 발생 원인
Expo 프로젝트는 고유의 `jest-expo` 프리셋을 사용하며, 이는 내부적으로 `babel-jest`를 선호합니다. 만약 프로젝트에 `ts-jest`가 혼합되어 있거나, `Transform` 설정이 중복될 경우 식별자 매핑 오류가 발생할 수 있습니다.

## 2. 권장 설정 (`jest.config.js`)

```javascript
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  // 만약 TypeScript 오류가 발생한다면 transform 설정을 명시적으로 조정하세요.
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  collectCoverage: true,
  coverageReporters: ['json-summary', 'text', 'lcov'],
};
```

## 3. ReferenceError 해결 방법
`ReferenceError: React is not defined` 등의 오류가 발생할 경우 `babel.config.js`에 아래 설정을 확인하세요.

```javascript
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // 필요한 플러그인 추가
    ],
  };
};
```

## 4. 커버리지 리포트 생성 팁
`quality-check`가 리포트를 정확히 인식하게 하려면 아래 명령어를 권장합니다.
```bash
npm test -- --coverage --coverageReporters="lcov" --coverageReporters="json-summary"
```

이 가이드는 `frontend` 모듈의 테스트 안정성을 확보하기 위해 작성되었습니다.
