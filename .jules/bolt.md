## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-23 - [Single-pass AST complexity calculation]
**Learning:** Using `@ast-grep/napi`, calling `node.findAll()` sequentially for nested rules inside a loop over matching symbols results in O(N*M) performance penalty across the JS/C++ boundary.
**Action:** Combine the parent and child AST node kinds into a single `root.findAll({ rule: { any: [...] } })` query and use a stack checking against `node.range()` indices to resolve nested relationships in one O(N) pass, significantly reducing overall complexity.

## 2025-02-23 - [Vitest Node 18 CI Failure]
**Learning:** Vitest 4.x fails with `Error: No such built-in module: node:inspector/promises` when executed on Node 18 environments due to Node version requirements.
**Action:** When this CI error occurs, add a step to `.github/workflows/ci.yml` conditionally downgrading `vitest` and `@vitest/coverage-v8` to `^2.1.8` specifically for Node 18 via `npm install --no-save` rather than rewriting standard configuration files.

## 2025-02-23 - [Safe optional chaining]
**Learning:** Hard crash from `TypeError: Cannot read properties of undefined` in Node testing environments when internal dependency mocks return empty or invalid structures.
**Action:** When evaluating return models from external or mocked dependencies like `checkEnv()`, always enforce strict typing checks or use optional chaining logic (`res?.pass`, `res?.suggestion`).
