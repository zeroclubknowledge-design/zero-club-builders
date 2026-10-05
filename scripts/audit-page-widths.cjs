// Tag page-width containers while leaving portal dialogs and text caps alone.
// --check reports any newly introduced untagged containers without editing.
const fs = require('fs'), ts = require('typescript');
const names = fs.readdirSync('src/routes').filter(n => /^app.*\.tsx$/.test(n));
const files = names.map(name => 'src/routes/' + name).concat([
  'src/features/bootcamps/BootcampForm.tsx',
  'src/features/notes/NoteReaderPage.tsx',
  'src/features/admin/AdminDashboard.tsx',
]);
let count = 0;
for (const path of files) {
  let source = fs.readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      const attr = node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(tree) === 'className');
      if (['div', 'main', 'article', 'header', 'section', 'nav', 'form', 'label'].includes(tag) && attr?.initializer && ts.isStringLiteral(attr.initializer)) {
        const cls = attr.initializer.text;
        const caps = [...cls.matchAll(/max-w-\[(\d+)px\]/g)].map(m => Number(m[1]));
        let parent = node.parent, portal = false;
        while (parent) {
          if (ts.isJsxElement(parent) && /^(DrawerContent|DialogContent|AlertDialogContent)$/.test(parent.openingElement.tagName.getText(tree))) portal = true;
          parent = parent.parent;
        }
        const pageFrame = caps.some(n => n >= 600) && /(?:^|\s)(?:md:)?mx-(?:auto|6)(?:\s|$)/.test(cls);
        const mainFrame = tag === 'main' && caps.some(n => n >= 400);
        if (!portal && (pageFrame || mainFrame) && !cls.includes('zc-page-width')) edits.push(attr.initializer.getStart(tree) + 1);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (edits.length) {
    console.log(`${path}: ${edits.length} page containers`);
    count += edits.length;
    if (!process.argv.includes('--check')) {
      for (const at of edits.sort((a, b) => b - a)) source = source.slice(0, at) + 'zc-page-width ' + source.slice(at);
      fs.writeFileSync(path, source);
    }
  }
}
console.log(`Scanned ${names.length} routes; ${count} untagged containers found.`);
if (process.argv.includes('--check') && count) process.exitCode = 1;
