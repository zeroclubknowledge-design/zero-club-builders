const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'src', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // We are looking for headers with "sticky top-0" or "fixed top-0" that DO NOT have safe-area-inset-top
  const headerRegex = /(<(?:header|div|section)\s+className=(?:\{`|")[^`"]*?(?:sticky top-0|fixed top-0)[^`"]*?(?:`\}|"))/g;
  
  content = content.replace(headerRegex, (match) => {
    if (match.includes('safe-area-inset-top')) return match;

    let newMatch = match;
    
    // If it has py-4, replace with pb-4 pt-[calc(1rem+env(safe-area-inset-top))]
    if (newMatch.includes('py-4')) {
      newMatch = newMatch.replace(/\bpy-4\b/, 'pb-4 pt-[calc(1rem+env(safe-area-inset-top))]');
    }
    // If it has py-3, replace with pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]
    else if (newMatch.includes('py-3')) {
      newMatch = newMatch.replace(/\bpy-3\b/, 'pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]');
    }
    // If it has pt-6, replace with pt-[calc(1.5rem+env(safe-area-inset-top))]
    else if (newMatch.includes('pt-6')) {
      newMatch = newMatch.replace(/\bpt-6\b/, 'pt-[calc(1.5rem+env(safe-area-inset-top))]');
    }
    // If it has h-14, replace with h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]
    else if (newMatch.includes('h-14')) {
      newMatch = newMatch.replace(/\bh-14\b/, 'h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]');
    }
    // If it has h-[60px], replace with h-[calc(60px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]
    else if (newMatch.includes('h-[60px]')) {
      newMatch = newMatch.replace(/h-\[60px\]/, 'h-[calc(60px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]');
    }
    // If it has h-[70px], replace with h-[calc(70px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]
    else if (newMatch.includes('h-[70px]')) {
      newMatch = newMatch.replace(/h-\[70px\]/, 'h-[calc(70px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]');
    }
    // Generic fallback if none of the above matched but it doesn't have pt- something else
    else if (!newMatch.match(/\bpt-\S+/)) {
      // Just add pt-[calc(0.5rem+env(safe-area-inset-top))]
      newMatch = newMatch.replace(/(sticky top-0|fixed top-0)/, '$1 pt-[calc(0.5rem+env(safe-area-inset-top))]');
    }
    
    return newMatch;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated safe area in ${file}`);
  }
}
