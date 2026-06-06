## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [Faster Field Extraction via Node Kinds]
**Learning:** When using `@ast-grep/napi` to extract specific parts of an AST like the source of an import statement, defining an `any` rule with multiple string-based patterns (e.g. `import $A from '$B'`) and then extracting matches via `m.getMatch('B')` is ~3x to 4x slower than directly matching the AST node kind (`{ kind: 'import_statement' }`) and extracting the named field (`m.field('source')`).
**Action:** Prefer direct AST node kind matching and `.field()` extraction over multi-pattern string rules and `.getMatch()` when parsing and extracting structured data. Note that `.field('source')?.text()` retains surrounding quotes which must be manually stripped.
