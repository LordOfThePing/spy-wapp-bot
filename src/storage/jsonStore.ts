import fs from "node:fs";
import path from "node:path";

export class JsonStore<T> {
  constructor(private readonly filePath: string, private readonly defaultValue: T) {}

  read(): T {
    this.ensureFile();
    const raw = fs.readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as T;
  }

  write(value: T): void {
    this.ensureParentDir();
    const tmpFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmpFile, this.filePath);
  }

  update(mutator: (current: T) => T): T {
    const current = this.read();
    const next = mutator(current);
    this.write(next);
    return next;
  }

  private ensureFile(): void {
    this.ensureParentDir();
    if (!fs.existsSync(this.filePath)) {
      this.write(this.defaultValue);
    }
  }

  private ensureParentDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
