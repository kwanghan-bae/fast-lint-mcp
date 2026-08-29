## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Combine Rule Objects Directly]
**Learning:** When combining multiple existing `@ast-grep/napi` rule objects (like `{ any: [...] }`) for a single traversal pass, trying to spread their underlying arrays (e.g. `[...Kinds1, ...Kinds2]`) can lead to reference errors if one of the variable lists isn't imported into the local scope.
**Action:** Nest the rule objects directly inside an `any` array (e.g., `{ any: [rule1, rule2] }`). Ast-grep supports nested `any` rules naturally.
