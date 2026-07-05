## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [AST Query Optimization in fd.ts]
**Learning:** Using multiple string pattern matching rules like `{ pattern: "import $A from '$B'" }` with `@ast-grep/napi` `findAll()` is significantly slower and less accurate than using a direct AST node kind check like `{ kind: 'import_statement' }` combined with `m.field('source')`. The string pattern approach evaluates complex regexes and can cause segmentation faults or O(N) regex overhead.
**Action:** Replace multi-pattern string rules with `kind` properties and use `m.field()` to extract target data when parsing ASTs.
