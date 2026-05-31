## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2024-05-31 - Vitest relative module resolution
**Learning:** In Vitest test files that mock native modules, `await import('../../native/index.js')` throws `Failed to load url` errors when the test file is located in a sibling directory (e.g., `tests/`), because it points to the parent of the root directory instead of the project root.
**Action:** When dynamically importing files from the `native/` directory in a test file located inside the `tests/` directory, the correct relative path is `../native/index.js`, not `../../native/index.js`.
