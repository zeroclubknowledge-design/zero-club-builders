const fs = require('fs');

const filesToMigrate = [
  'src/components/CommentDrawer.tsx',
  'src/routes/app.clubs.chat.tsx',
  'src/routes/app.clubs.index.tsx',
  'src/routes/app.profile.$id.tsx',
  'src/routes/app.profile.index.tsx',
  'src/routes/app.settings.account.tsx',
  'src/routes/app.tsx',
  'src/routes/app.tutor-studio.index.tsx',
  'src/routes/app.wallet.tsx'
];

filesToMigrate.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let oldContent = content;

  // 1. Replace the import
  content = content.replace(
    /import\s+\{\s*Sheet,\s*SheetContent(,\s*SheetHeader)?(,\s*SheetTitle)?(,\s*SheetTrigger)?(,\s*SheetClose)?\s*\}\s*from\s*['"]@\/components\/ui\/sheet['"]/g,
    (match) => match.replace(/Sheet/g, 'Drawer').replace('components/ui/sheet', 'components/ui/drawer')
  );
  
  // also handle multi-line imports
  content = content.replace(/@\/components\/ui\/sheet/g, '@/components/ui/drawer');

  // 2. Replace all components
  content = content.replace(/<Sheet/g, '<Drawer')
                   .replace(/<\/Sheet/g, '</Drawer')
                   .replace(/SheetContent/g, 'DrawerContent')
                   .replace(/SheetHeader/g, 'DrawerHeader')
                   .replace(/SheetTitle/g, 'DrawerTitle')
                   .replace(/SheetTrigger/g, 'DrawerTrigger')
                   .replace(/SheetClose/g, 'DrawerClose');

  // 3. Remove side="bottom" from DrawerContent
  content = content.replace(/<DrawerContent[^>]*side="bottom"/g, match => match.replace(/\s*side="bottom"/, ''));

  if (content !== oldContent) {
    fs.writeFileSync(f, content, 'utf8');
    console.log('Migrated to Drawer:', f);
  }
});
