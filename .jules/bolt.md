## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Combine Nested AST Traversals]
**Learning:** Calling `node.findAll()` sequentially inside a loop over matched nodes (e.g., iterating through symbols to find their complexity) is highly inefficient (O(N*M)) as it repeatedly crosses the JS/C++ boundary.
**Action:** Optimize this by combining target node kinds into a single `root.findAll({ any: [...] })` query, and resolving structural relationships (like nesting) in a single pass using a stack based on node interval ranges (`range.start.index` and `range.end.index`).

## 2025-02-13 - [Vitest Mocks and Fallback Environments]
**Learning:** `vi.restoreAllMocks()` replaces mocked implementations with `undefined`. If a function like `checkEnv()` is mocked to return `{ pass: true }` but then restored inside `afterEach`, a subsequent test or async tick might receive `undefined`, causing `TypeError: Cannot read properties of undefined` in fallback error handlers.
**Action:** Enforce strict typing checks or use optional chaining logic (`res?.pass`, `res?.suggestion`) when evaluating return models from dependencies or mocks to avoid crashes in fallback environments.
