## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Node Kind Matching vs String Pattern]
**Learning:** Using an array of structural string patterns like `{ any: [ { pattern: "import $A from '$B'" }, ... ] }` to match all variations of an import statement is extremely slow in `@ast-grep/napi` because it must parse and test multiple string templates against every AST node.
**Action:** Replace complex multi-pattern string rules with direct AST node kind matching (e.g., `{ rule: { kind: 'import_statement' } }`). It naturally matches all syntactic variations (like `import type` or `import * as X`) and is an order of magnitude faster. Extract dynamic parts using `node.field('fieldName')` and manually strip quotes from the resulting `.text()` if necessary. Be extremely careful when using `node.field('fieldName')` directly; always assign it to a variable and check for null/undefined before calling methods on it, otherwise the native bridge will cause a Segmentation Fault.
