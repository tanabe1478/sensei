import { spawn, type ChildProcess } from 'child_process';

export interface ProcessOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Record<string, string>;
}

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** 子プロセスを spawn して結果を返す。タイムアウト付き。 */
export function runProcess(options: ProcessOptions): { promise: Promise<ProcessResult>; kill: () => void } {
  let child: ChildProcess | null = null;
  let killed = false;

  const promise = new Promise<ProcessResult>((resolve, reject) => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => stdout.push(data.toString()));
    child.stderr?.on('data', (data: Buffer) => stderr.push(data.toString()));

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child?.kill('SIGTERM');
          reject(new Error(`Process timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      if (!killed) {
        resolve({
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          exitCode: code,
        });
      }
    });

    child.on('error', (err) => {
      if (timeout) clearTimeout(timeout);
      reject(err);
    });
  });

  return {
    promise,
    kill: () => {
      killed = true;
      child?.kill('SIGTERM');
    },
  };
}
