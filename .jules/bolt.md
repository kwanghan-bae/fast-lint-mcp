## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2024-06-12 - [⚡ Bolt: Replaced string pattern matching with AST kind checks for import/export discovery]
**Learning:** When using @ast-grep/napi to extract named fields (like the 'source' of an import statement), extracting parts of matches via string replacement patterns (e.g., `m.getMatch('VAR')` with patterns like `import { $$$ } from '$B'`) is significantly slower than direct AST node kind matching (e.g., `{ kind: 'import_statement' }`) combined with `m.field('fieldName')`. Furthermore, string patterns often miss important variations like `import type` or `export * from`.
**Action:** When extracting data across AST nodes like imports or exports, rely on `kind: 'import_statement'` and `m.field('source')?.text().replace(/^["']|["']$/g, '')` for maximum performance (up to 10x faster) and correctness.
