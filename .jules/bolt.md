## 2024-05-18 - [Optimize @ast-grep/napi AST existence check]
**Learning:** Checking for pattern existence using `root.findAll(pattern).length > 0` causes O(N) AST traversal and memory allocation.
**Action:** Use `root.find(pattern) !== null` instead for existence checks, to short-circuit the traversal on the first match.
