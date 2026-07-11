## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.
## 2025-02-12 - [AST Named Field Extraction]
**Learning:** Extracting named fields like 'source' using `m.getMatch('B')` or regex string interpolation inside `@ast-grep/napi` `findAll` patterns is extremely slow and memory intensive. Direct kind matching (`{ kind: 'import_statement' }`) paired with `.field('fieldName')` is much faster.
**Action:** Use `.field('fieldName')` when extracting specific parts of an AST node. Always verify the field node exists before calling `.text()`.

## 2025-02-12 - [AST Node Name Extraction Bug]
**Learning:** Using `node.find({ rule: { kind: 'identifier' } })` to get the name of a class or function declaration searches the entire subtree. For anonymous arrow functions, it incorrectly returns the name of the first variable declared inside the body.
**Action:** Use `node.field('name')` to correctly retrieve the name of a declaration, falling back to 'anonymous' if it doesn't exist.
