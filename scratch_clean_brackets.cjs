const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src');
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // We are looking for class strings that have stray ` ]` or ` ]"` 
  content = content.replace(/(className=(?:\{`|["']))([^"'`}]*)(["'`\}])/g, (match, prefix, classStr, suffix) => {
    // Check if there is a stray `]` that's not part of `text-[10px]` etc.
    // Specifically, if there is a space before the `]` or it's at the end of the class string.
    let newClassStr = classStr.replace(/\s+\](?=\s|$)/g, '').replace(/\]$/g, '').trim();
    if (newClassStr !== classStr) {
      return prefix + newClassStr + suffix;
    }
    return match;
  });

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Cleaned up ${file}`);
  }
});

console.log('Changed ' + changedFiles + ' files.');
