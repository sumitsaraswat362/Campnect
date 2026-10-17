const fs = require('fs');
let content = fs.readFileSync('artifacts/campnect-admin/src/pages/accounts/detail.tsx', 'utf8');

content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@\/components\/ui\/primitives['"];/g, (match, imports) => {
  const items = imports.split(',').map(s => s.trim()).filter(Boolean);
  let newImports = '';
  
  const groupings = {
    'Button': 'button',
    'Input': 'input',
    'Label': 'label',
    'Card': 'card',
    'CardContent': 'card',
    'CardHeader': 'card',
    'CardTitle': 'card',
    'Badge': 'badge',
    'Table': 'table',
    'TableHeader': 'table',
    'TableRow': 'table',
    'TableHead': 'table',
    'TableBody': 'table',
    'TableCell': 'table',
    'Dialog': 'dialog',
    'DialogContent': 'dialog',
    'DialogHeader': 'dialog',
    'DialogTitle': 'dialog',
    'DialogDescription': 'dialog',
    'DialogFooter': 'dialog',
    'Textarea': 'textarea',
    'cn': 'utils'
  };

  const importedGroups = {};
  items.forEach(item => {
    const file = groupings[item];
    if (file) {
      if (!importedGroups[file]) importedGroups[file] = [];
      importedGroups[file].push(item);
    } else {
      if (!importedGroups['utils']) importedGroups['utils'] = [];
      importedGroups['utils'].push(item);
    }
  });

  for (const [file, groupedItems] of Object.entries(importedGroups)) {
    if (file === 'utils') {
        newImports += `import { ${groupedItems.join(', ')} } from '@/lib/utils';\n`;
    } else {
        newImports += `import { ${groupedItems.join(', ')} } from '@/components/ui/${file}';\n`;
    }
  }

  return newImports.trim();
});

fs.writeFileSync('artifacts/campnect-admin/src/pages/accounts/detail.tsx', content, 'utf8');
