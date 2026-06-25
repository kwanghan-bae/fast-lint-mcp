## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Import Query Optimization]
**Learning:** Using `root.findAll` with string pattern variants (e.g. `import $A from '$B'`, `import { $$$ } from '$B'`) in an `any` rule array is extremely slow because the AST engine has to evaluate multiple complex text-based rules across the entire tree.
**Action:** Replace string matching with a single direct node kind match (`{ kind: 'import_statement' }`) and extract the target using native `.field('source')?.text()` (stripping surrounding quotes with `.slice(1, -1)`). This results in an immediate ~3-4x performance improvement for file dependency extraction logic.
