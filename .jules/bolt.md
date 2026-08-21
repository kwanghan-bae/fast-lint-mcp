## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-12 - [AST Node Name Extraction]
**Learning:** Using `@ast-grep/napi`'s subtree search `node.find({ rule: { kind: 'identifier' } })` to extract names from function/class declarations is slow (~2.3x slower) because it traverses the entire subtree, and can be incorrect by matching internal variables.
**Action:** Extract names directly using `node.field('name')`. If undefined (e.g. anonymous functions assigned to variables), inspect `node.parent()` for `variable_declarator` ('name' field) or `pair` ('key' field).

## 2025-02-12 - [Mock Return Values]
**Learning:** `checkEnv()` may return undefined during mocked environments or initialization failures, causing `TypeError: Cannot read properties of undefined` at `res.pass`.
**Action:** Enforce strict typing checks or use optional chaining logic (`res?.pass`, `res?.suggestion`) when evaluating return models from dependencies/mocks.

## 2025-02-12 - [Vitest Mocks]
**Learning:** In Vitest, `vi.restoreAllMocks()` destroys the original implementation of mocked functions created via `vi.mock()`, replacing them with `undefined`, which can cause subsequent tests to fail with undefined references.
**Action:** Use `vi.clearAllMocks()` in `afterEach` hooks if you only want to reset call counts and results without breaking subsequent tests.
