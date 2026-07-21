## 2025-02-12 - [AST Query Optimization]
**Learning:** For AST existence checks in `@ast-grep/napi`, using `root.findAll(pattern).length > 0` iterates through the entire AST to find all matches and allocates memory for them before checking length, causing O(N) overhead.
**Action:** Use `root.find(pattern) !== null` instead to short-circuit the traversal on the first match.

## 2025-02-12 - [Combine AST Traversals]
**Learning:** Calling `root.findAll({ rule: { kind } })` sequentially for multiple AST node kinds (e.g. `function_declaration`, `class_declaration`) results in traversing the entire AST multiple times (O(K*N) where K is number of kinds).
**Action:** Combine multiple sequential queries into a single pass using the `any` rule: `{ any: kinds.map(kind => ({ kind })) }` so the AST is traversed exactly once.

## 2025-02-13 - [Optimize Extract Imports in fd.ts]
**Learning:** Extracting parts of matches using string replacement patterns in `@ast-grep/napi` (e.g., \`m.getMatch('B')?.text()\`) for extracting import sources is slower than direct AST node kind matching (\`{ kind: 'import_statement' }\`) combined with extracting a named field (\`m.field('source')\`). It takes about 6s vs 5.8s for 500 iterations on large texts.
**Action:** Replaced string match extraction with direct kind match and field access in `src/analysis/fd.ts` for performance optimization.
