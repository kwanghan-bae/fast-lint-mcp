## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AnalysisService Test Fixes]
**Learning:** `AnalysisService.validateEnvironment()` was accessing `res.pass` where `res` could potentially be undefined if mocked incorrectly or if the fallback structure changes, causing a `TypeError`. More critically, the test failures in CI were caused by returning `{ pass: false, report: { pass: false, ... } }` but the caller expected `report` structure implicitly in other files.
**Action:** Added safe access using `res?.pass` in `AnalysisService.ts` and corrected mock implementation in `error_paths.test.ts` to ensure stability.

## 2025-02-12 - [Mocking CheckEnv]
**Learning:** Returning nested object responses like `{ pass: true }` in `checkEnv()` mocks ensures correct behavior in dependent services (e.g. `AnalysisService`). When a nested property is expected and missing, checking optional chaining (`res?.pass`) avoids `TypeError: Cannot read properties of undefined`.
**Action:** Enforce strict typing checks or optional chaining logic `?.` whenever evaluating return models from dependencies.
