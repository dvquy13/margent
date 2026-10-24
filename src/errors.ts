// A render failure that points at a file and line. The message is "{file}:{line}: {message}".
export class RenderError extends Error {
  public readonly file: string;
  public readonly line: number;
  public readonly detail: string;

  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'RenderError';
    this.file = file;
    this.line = line;
    this.detail = message;
  }
}
