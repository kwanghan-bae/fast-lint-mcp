## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Kind Lookup Performance]
**Learning:** In `@ast-grep/napi`, multi-pattern string rules (e.g., matching different quotes or bracket formats for `import`) introduce significant parsing and traversal overhead compared to matching the exact AST node kind directly.
**Action:** When extracting data based on AST structures, prefer `root.findAll({ rule: { kind: 'node_type' } })` and extract fields via `m.field('field_name')` rather than complex string patterns with meta variables.

## 2025-02-13 - [Concurrent File Analysis]
**Learning:** Extracting data sequentially across many files wastes CPU cycles waiting for I/O and synchronous parsing one file at a time. Concurrency allows the event loop to manage parallel file reads and interleaved parsing effectively.
**Action:** For cross-file operations, wrap the per-file logic in async functions and execute them concurrently via `Promise.all` or bounded concurrency tools like `p-map` (which is already a project dependency).

## 2025-02-13 - [Vitest and Node 18 Compatibility]
**Learning:** Vitest 4.x in this repository requires Node.js 20+. Running tests via `npm test` on Node 18 fails with module resolution errors (`node:inspector/promises`). Modifying `package.json` breaks newer Node.js versions or peer dependencies.
**Action:** Do not attempt to fix this by modifying `package.json` to downgrade vitest or breaking the CI matrix by dropping Node 18 unless explicitly instructed. Instead, dynamically downgrade vitest in the GitHub Actions workflow using `npm install vitest@^2.1.8 @vitest/coverage-v8@^2.1.8 --no-save` specifically for Node 18.

## 2025-02-13 - [Vitest and Dynamic Imports in Tests]
**Learning:** Using dynamic imports (like `await import('../../native/index.js')`) inside test files evaluates relative paths from the perspective of the *test runner's root or current working directory* rather than the file itself. This leads to module resolution errors (`Failed to load url ../../native/index.js`) in Vitest.
**Action:** Always use static imports at the top of the file (e.g., `import { func } from '../native/index.js'`) and mock if necessary, rather than relying on dynamic imports in nested test blocks. Ensure relative import/mock paths correctly map to the target file (from `tests/` directory, use `../native/index.js`).
