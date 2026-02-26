import { Lang, parse } from '@ast-grep/napi';

const code = `
class Test {
  myVar = 1;
  method() {}
}
function topFunc() {}
const arrowFunc = () => {}
`;

const ast = parse(Lang.JavaScript, code);
const root = ast.root();

function printKinds(node: any, indent = 0) {
  const fullText = node.text();
  const firstLine = fullText.split(String.fromCharCode(10))[0];
  console.log(' '.repeat(indent) + node.kind() + ': ' + (firstLine.length > 40 ? firstLine.substring(0, 40) + '...' : firstLine));
  for (const child of node.children()) {
    printKinds(child, indent + 2);
  }
}

printKinds(root);
