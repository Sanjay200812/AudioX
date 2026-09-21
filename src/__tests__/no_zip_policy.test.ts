import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Absolute NO ZIP Policy Compliance Check', () => {
  it('ensures package.json contains zero zip or archive packages', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    expect(allDeps['jszip']).toBeUndefined();
    expect(allDeps['archiver']).toBeUndefined();
    expect(allDeps['adm-zip']).toBeUndefined();
    expect(allDeps['tar']).toBeUndefined();
  });

  it('scans codebase to ensure no forbidden ZIP bundling patterns exist in source', () => {
    const srcDir = path.resolve(__dirname, '../');

    function scanFiles(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanFiles(fullPath, fileList);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          if (!fullPath.includes('no_zip_policy.test.ts')) {
            fileList.push(fullPath);
          }
        }
      }
      return fileList;
    }

    const files = scanFiles(srcDir);
    const forbiddenPhrases = [
      'createArchive',
      'Download All ZIP',
      'Download Playlist.zip',
      'playlist.zip',
      'bundle files',
      'archiver(',
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const phrase of forbiddenPhrases) {
        const found = content.toLowerCase().includes(phrase.toLowerCase());
        expect(
          found,
          `Forbidden phrase "${phrase}" found in ${path.relative(srcDir, filePath)}`
        ).toBe(false);
      }
    }
  });
});
