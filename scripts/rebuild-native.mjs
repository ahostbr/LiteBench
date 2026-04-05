#!/usr/bin/env node
/**
 * rebuild-native.mjs
 * 
 * Rebuilds native modules (node-pty, better-sqlite3) for Electron's ABI.
 * 
 * Problem: @electron/rebuild fails on node-pty because winpty's build system
 * uses batch file scripts (GetCommitHash.bat, UpdateGenVersion.bat) that run
 * via `cmd /c "cd shared && <script>.bat"`, but node-gyp doesn't set the CWD
 * to the gyp file's directory on Windows with pnpm's nested .pnpm store layout.
 *
 * Fix:
 *   1. Replace GetCommitHash.bat call with a static 'unknown' value.
 *   2. Replace UpdateGenVersion.bat call with an empty string (we create GenVersion.h manually).
 *   3. Create deps/winpty/src/gen/GenVersion.h with stub content.
 *   4. Fix the include_dirs to point to 'gen' instead of the bat output.
 *   5. Run @electron/rebuild normally.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Find the real path to node-pty (resolves pnpm symlink)
const nodePtyMain = require.resolve('node-pty/package.json', { paths: [projectRoot] });
const nodePtyRoot = dirname(nodePtyMain);
const winptyGypPath = resolve(nodePtyRoot, 'deps/winpty/src/winpty.gyp');
const genDirPath = resolve(nodePtyRoot, 'deps/winpty/src/gen');
const genVersionPath = resolve(genDirPath, 'GenVersion.h');

console.log('[rebuild-native] node-pty root:', nodePtyRoot);
console.log('[rebuild-native] Patching winpty.gyp...');

let gyp = readFileSync(winptyGypPath, 'utf8');
let patched = false;

// Patch 1: Replace GetCommitHash.bat call
const old1 = `'WINPTY_COMMIT_HASH%': '<!(cmd /c "cd shared && GetCommitHash.bat")',`;
const new1 = `'WINPTY_COMMIT_HASH%': 'unknown',`;
if (gyp.includes(old1)) {
  gyp = gyp.replace(old1, new1);
  patched = true;
  console.log('[rebuild-native]   Patch 1: GetCommitHash.bat -> static value');
}

// Patch 2: Replace UpdateGenVersion.bat call  
const old2 = `'<!(cmd /c "cd shared && UpdateGenVersion.bat <(WINPTY_COMMIT_HASH)")',`;
const new2 = `'',`;
if (gyp.includes(old2)) {
  gyp = gyp.replace(old2, new2);
  patched = true;
  console.log('[rebuild-native]   Patch 2: UpdateGenVersion.bat -> empty string');
}

// Patch 3: Fix include_dirs '' -> 'gen'
const old3 = `            # Add the 'src/gen' directory to the include path and force gyp to
            # run the script (re)generating the version header.
            '',`;
const new3 = `            # Add the 'src/gen' directory to the include path and force gyp to
            # run the script (re)generating the version header.
            'gen',`;
if (gyp.includes(old3)) {
  gyp = gyp.replace(old3, new3);
  patched = true;
  console.log('[rebuild-native]   Patch 3: include_dirs -> gen/');
}

if (patched) {
  writeFileSync(winptyGypPath, gyp, 'utf8');
  console.log('[rebuild-native] winpty.gyp patched');
}

// Create GenVersion.h stub
if (!existsSync(genDirPath)) {
  mkdirSync(genDirPath, { recursive: true });
}
writeFileSync(genVersionPath, [
  '// AUTO-GENERATED STUB (electron-rebuild pnpm workaround)',
  'const char GenVersion_Version[] = "1.1.0";',
  'const char GenVersion_Commit[] = "unknown";',
  '',
].join('\n'), 'utf8');
console.log('[rebuild-native] GenVersion.h stub created at:', genVersionPath);

// Run @electron/rebuild for node-pty and better-sqlite3
console.log('[rebuild-native] Running @electron/rebuild...');
try {
  execSync('npx @electron/rebuild -m . -o node-pty,better-sqlite3', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  console.log('[rebuild-native] Rebuild complete');
} catch (err) {
  console.error('[rebuild-native] Rebuild failed:', err.message);
  process.exit(1);
}
