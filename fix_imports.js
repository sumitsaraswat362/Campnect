const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('artifacts/campnect-admin/src/pages');
files.push('artifacts/campnect-admin/src/components/layout.tsx');

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('@/components/ui/primitives')) {
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
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed', file);
  }
});
