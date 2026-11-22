import fs from 'fs';
import path from 'path';

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = walk('./src');
files.push('./index.html');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let updated = content;

  // 1. Replace text-[9px], text-[10px], text-[11px] with text-xs
  updated = updated.replace(/text-\[9px\]/g, 'text-xs');
  updated = updated.replace(/text-\[10px\]/g, 'text-xs');
  updated = updated.replace(/text-\[11px\]/g, 'text-xs');

  // 2. Replace min-h-screen with min-h-dvh
  updated = updated.replace(/min-h-screen/g, 'min-h-dvh');

  // 3. Add role="dialog" aria-modal="true" to fixed inset-0 containers if not already present
  // Match <div ... className="... fixed inset-0 ..."> or similar
  updated = updated.replace(
    /<div([^>]*className="[^"]*fixed\s+inset-0[^"]*")([^>]*)>/g,
    (match, p1, p2) => {
      if (!match.includes('role="dialog"') && !match.includes("role='dialog'")) {
        return `<div${p1}${p2} role="dialog" aria-modal="true">`;
      }
      return match;
    }
  );

  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`Updated: ${file}`);
  }
}
console.log('Refactoring complete.');
