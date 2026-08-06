import fs from "node:fs";
import path from "node:path";

export class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return { username: "", autoReconnect: true };
    }
  }

  write(settings) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2), "utf8");
    fs.renameSync(temp, this.filePath);
  }
}
