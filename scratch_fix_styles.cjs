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

  // Find classNames containing 'uppercase' and 'tracking-' and replace the specific classes.
  // We use a regex that matches `className="...uppercase...tracking-..."` or similar class strings
  // but we can just do a simpler approach:
  // Split content by `className="` or `className={`
  // This is safer. Actually, regex replacing the class string directly is better.
  
  content = content.replace(/(className=(?:\{`|["']))([^"'`}]*)(["'`\}])/g, (match, prefix, classStr, suffix) => {
    if (classStr.includes('uppercase') && classStr.includes('tracking-')) {
      let newClassStr = classStr
        .replace(/\buppercase\b/g, '')
        .replace(/\btracking-[a-zA-Z0-9\[\].-]+\b/g, '')
        .replace(/\bfont-(bold|black|semibold|extrabold)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return prefix + newClassStr + suffix;
    }
    return match;
  });

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Updated ${file}`);
  }
});

console.log('Changed ' + changedFiles + ' files.');
