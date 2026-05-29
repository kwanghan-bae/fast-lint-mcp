## 2024-05-15 - AST-Grep findAll vs find
**Learning:** Using `root.findAll(pattern).length > 0` iterates over the entire tree even after a match is found, causing O(N) overhead.
**Action:** Always use `root.find(pattern) !== null` for existence checks to short-circuit the traversal on the first match.

## 2024-05-16 - Sequential vs Compiled Rules
**Learning:** Running `root.find` sequentially inside a loop over multiple patterns scales poorly (O(K * N) where K is patterns).
**Action:** Use `any` rule with `map` to pre-compile patterns into a single rule: `{ any: patterns.map(p => ({ pattern: p })) }`. This traverses the tree only once.

## 2024-05-17 - String Pattern vs AST Node Kind
**Learning:** Using `@ast-grep/napi`'s `pattern` matcher with strings is significantly slower than directly matching the equivalent AST node kinds (like `import_statement`).
**Action:** Always prefer matching AST node kinds directly (`{ kind: '...' }`) over string patterns when possible for high-frequency queries.

## 2024-06-25 - Avoid spaces in ast-grep pattern matches for JSX
**Learning:** We wanted to use direct AST node kinds (`{ kind: 'jsx_element' }`) for performance instead of a string pattern for JSX elements in shared rules. However, evaluating `jsx_element` on a plain TypeScript (`Lang.TypeScript`) AST fails with an error because that node kind doesn't exist in TS (only TSX/JSX).
**Action:** Instead of node kinds, we kept the string pattern but removed the space after the angle bracket (`<$A $$$ />` instead of `< $A $$$ />`). Removing spaces in string patterns drastically reduces parsing overhead for `@ast-grep/napi`, yielding nearly the same 10x performance boost without breaking plain TS compatibility.
