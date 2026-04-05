import { spawn } from 'child_process';
import type { SetupCheckResult } from '../../shared/types';
import { getPythonPath } from './tool-executor';

function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number,
  stdinData?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr: 'Timed out', code: -1 });
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, code: -1 });
    });

    if (stdinData !== undefined) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
  });
}

export async function checkDependencies(): Promise<SetupCheckResult[]> {
  const results: SetupCheckResult[] = [];

  // Python — use the same path that tool-executor uses
  const pythonPath = getPythonPath();
  {
    const { stdout, code } = await runCommand(pythonPath, ['--version'], 10_000);
    if (code === 0) {
      const version = stdout.trim() || 'unknown';
      results.push({ component: 'python', installed: true, version: `${version} (${pythonPath})` });
    } else {
      results.push({ component: 'python', installed: false, error: `python not found (tried: ${pythonPath})` });
    }
  }

  // pip packages (duckduckgo_search + html2text)
  // Use stdin to avoid cmd.exe mangling Python code with semicolons/quotes
  {
    const { code: ddgsCode, stdout: ddgsOut, stderr: ddgsErr } = await runCommand(
      pythonPath,
      ['-'],
      10_000,
      'import duckduckgo_search\nprint(getattr(duckduckgo_search, "__version__", "installed"))\n',
    );
    if (ddgsCode === 0) {
      results.push({
        component: 'duckduckgo-search',
        installed: true,
        version: ddgsOut.trim() || 'installed',
      });
    } else {
      results.push({
        component: 'duckduckgo-search',
        installed: false,
        error: ddgsErr.trim().split('\n').pop() || 'Not installed',
      });
    }

    const { code: htmlCode, stderr: htmlErr } = await runCommand(
      pythonPath,
      ['-'],
      10_000,
      'import html2text\nprint("ok")\n',
    );
    if (htmlCode === 0) {
      results.push({ component: 'html2text', installed: true });
    } else {
      results.push({
        component: 'html2text',
        installed: false,
        error: htmlErr.trim().split('\n').pop() || 'Not installed',
      });
    }
  }

  // yt-dlp
  {
    const { stdout, code } = await runCommand('yt-dlp', ['--version'], 10_000);
    if (code === 0) {
      results.push({ component: 'yt-dlp', installed: true, version: stdout.trim() });
    } else {
      results.push({ component: 'yt-dlp', installed: false, error: 'yt-dlp not found' });
    }
  }

  // Node.js
  {
    const { stdout, code } = await runCommand('node', ['--version'], 10_000);
    if (code === 0) {
      results.push({ component: 'node', installed: true, version: stdout.trim() });
    } else {
      results.push({ component: 'node', installed: false, error: 'node not found in PATH' });
    }
  }

  // Playwright
  {
    const { stdout, code } = await runCommand('npx', ['playwright', '--version'], 15_000);
    if (code === 0) {
      results.push({ component: 'playwright', installed: true, version: stdout.trim() });
    } else {
      results.push({ component: 'playwright', installed: false, error: 'playwright not found (run: npx playwright install chromium)' });
    }
  }

  // PowerShell
  {
    const { stdout, code } = await runCommand('powershell', ['-Command', 'echo ok'], 10_000);
    if (code === 0 && stdout.trim() === 'ok') {
      results.push({ component: 'powershell', installed: true });
    } else {
      results.push({ component: 'powershell', installed: false, error: 'powershell not found in PATH' });
    }
  }

  return results;
}

export async function installDependency(name: string): Promise<boolean> {
  let args: string[];

  switch (name) {
    case 'pip-packages':
      args = ['-m', 'pip', 'install', 'duckduckgo-search', 'html2text'];
      break;
    case 'yt-dlp':
      args = ['-m', 'pip', 'install', 'yt-dlp'];
      break;
    case 'playwright-browsers': {
      const { code } = await runCommand('npx', ['playwright', 'install', 'chromium'], 120_000);
      return code === 0;
    }
    default:
      return false;
  }

  const { code } = await runCommand(getPythonPath(), args, 60_000);
  return code === 0;
}
