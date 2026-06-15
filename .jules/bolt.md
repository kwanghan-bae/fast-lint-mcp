## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Import Statement Extraction]
**Learning:** Using `@ast-grep/napi` string patterns (e.g., `import $A from '$B'`) with `findAll` inside `extractImportsFromFile` causes significant O(n) parsing overhead compared to directly searching the AST tree structure. Also, string patterns missed complex forms like `import type`.
**Action:** Replaced the multi-string pattern with a direct AST node kind check (`{ kind: 'import_statement' }`) and used `.field('source')?.text()` to pull the import source text, extracting string contents dynamically via `.slice(1, -1)`. This speeds up parsing dramatically and covers more syntaxes gracefully.
