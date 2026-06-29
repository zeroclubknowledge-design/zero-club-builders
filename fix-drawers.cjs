const fs = require('fs');
const path = require('path');

const routesDir = 'src/routes';
const componentsDir = 'src/components';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Find all <SheetContent side="bottom" ...>
  // and replace rounded-t-[something] or rounded-t-2xl etc with rounded-none
  content = content.replace(/(<SheetContent[^>]*side=["']bottom["'][^>]*className=["'][^"']*)rounded-t-[a-zA-Z0-9\[\]-]+([^"']*["'])/g, '$1rounded-none$2');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

walkDir(routesDir);
walkDir(componentsDir);
console.log('Done removing roundness from drawers');
