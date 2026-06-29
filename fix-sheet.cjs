const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let changed = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  const old = content;
  content = content.replace(/<SheetContent[^>]+className=["'][^"']+["'][^>]*>/g, match => {
    if (match.includes('side="bottom"') || match.includes('side={')) {
      // remove rounded-none, rounded-t-[something], rounded-t-3xl, etc
      return match
        .replace(/rounded-none/g, '')
        .replace(/rounded-t-\[[^\]]+\]/g, '')
        .replace(/rounded-t-[a-z0-9]+/g, '')
        .replace(/\s+/g, ' ')
        .replace(/ className=" /g, ' className="');
    }
    return match;
  });
  if (old !== content) {
    fs.writeFileSync(f, content);
    changed++;
    console.log('Fixed', f);
  }
});
console.log('Done, updated', changed, 'files');
