import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { app } from 'electron';
import path from 'path';
import { toolRegistry } from './tool-registry';

/**
 * Resolve Python executable path. Tries multiple strategies:
 * 1. Check common Windows install locations
 * 2. `where python` via shell
 * 3. Bare `python` fallback
 */
let _pythonPath: string | null = null;
function getPythonPath(): string {
  if (_pythonPath) return _pythonPath;

  // Strategy 1: Check known Windows install paths
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'AppData/Local/Programs/Python/Python315/python.exe'),
    path.join(home, 'AppData/Local/Programs/Python/Python314/python.exe'),
    path.join(home, 'AppData/Local/Programs/Python/Python313/python.exe'),
    path.join(home, 'AppData/Local/Programs/Python/Python312/python.exe'),
    path.join(home, 'AppData/Local/Programs/Python/Python311/python.exe'),
    path.join(home, 'AppData/Local/Programs/Python/Python310/python.exe'),
    'C:/Python315/python.exe',
    'C:/Python313/python.exe',
    'C:/Python312/python.exe',
    'C:/Python311/python.exe',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      _pythonPath = p;
      return p;
    }
  }

  // Strategy 2: Ask the shell
  try {
    const result = execSync('where python', {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, PATH: process.env.PATH },
    }).split('\n')[0].trim();
    if (result && existsSync(result)) {
      _pythonPath = result;
      return result;
    }
  } catch { /* ignore */ }

  // Strategy 3: bare name (last resort)
  _pythonPath = 'python';
  return _pythonPath;
}

function getMcpServerPath(): string {
  const appPath = app.getAppPath();

  // In ASAR-packaged builds, mcp-server is outside the archive
  if (appPath.includes('.asar')) {
    return path.join(path.dirname(appPath), 'mcp-server');
  }

  // Dev/built output: try app path first, then project root
  const fromApp = path.join(appPath, 'mcp-server');
  if (existsSync(fromApp)) return fromApp;

  // Fallback: walk up from appPath to find mcp-server (handles out/main/ build paths)
  let dir = appPath;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'mcp-server');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Last resort: relative to cwd
  return path.join(process.cwd(), 'mcp-server');
}

/**
 * Build a Python script that reads args JSON from stdin.
 * User-controlled data (args) never appears in the script string — it flows through stdin only.
 */
function buildPythonScript(handler: string, module: string): string {
  return (
    `import sys, json; ` +
    `from tools.${module} import ${handler}; ` +
    `args = json.loads(sys.stdin.read()); ` +
    `print(${handler}(**args))`
  );
}

async function runPython(
  script: string,
  stdinData: string,
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const env = {
      ...process.env,
      // Ensure Windows system vars are present (Electron may strip them)
      SystemRoot: process.env.SystemRoot || 'C:\\WINDOWS',
      COMSPEC: process.env.COMSPEC || 'C:\\WINDOWS\\system32\\cmd.exe',
    };
    const proc = spawn(pythonPath, ['-c', script], { cwd, env });

    const onAbort = () => {
      proc.kill();
      reject(new Error('Tool execution timed out'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Python exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error(`${err.message} (python=${pythonPath}, cwd=${cwd})`));
    });

    // Write args JSON to stdin — this is where user data flows, safely isolated
    proc.stdin.write(stdinData);
    proc.stdin.end();
  });
}

/**
 * Execute an MCP tool by name with given arguments.
 * Never throws — returns an error string so the model can adapt.
 * Args are passed via stdin to eliminate any injection surface.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = toolRegistry.getExecutor(name);
  if (!tool) {
    return `Error: Unknown tool '${name}'. Available tools: ${toolRegistry.getToolNames().join(', ')}`;
  }

  // In-process path (e.g. browser tools wired via IPC)
  if ('executor' in tool) {
    try {
      return await tool.executor(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Tool error (${name}): ${msg}`;
    }
  }

  // Python subprocess path
  const cwd = getMcpServerPath();
  if (!existsSync(cwd)) {
    return `Tool error (${name}): mcp-server directory not found at ${cwd}`;
  }
  const script = buildPythonScript(tool.handler, tool.module);
  const stdinData = JSON.stringify(args);

  const attempt = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      return await runPython(script, stdinData, cwd, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await attempt();
  } catch {
    // Retry once
    try {
      return await attempt();
    } catch (secondError) {
      const msg = secondError instanceof Error ? secondError.message : String(secondError);
      return `Tool error (${name}): ${msg}`;
    }
  }
}
