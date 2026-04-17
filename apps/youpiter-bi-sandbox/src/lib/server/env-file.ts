import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function readEnvFileValue(name: string): string {
  const candidates = [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), "..", ".env.local"),
    join(process.cwd(), "..", "..", ".env.local"),
    "/opt/youpiter-bi/.env.local",
  ];

  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
      if (!line) continue;
      return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
    } catch {
      // try next candidate
    }
  }
  return "";
}

export function writeEnvFileValue(name: string, value: string): void {
  const file = "/opt/youpiter-bi/.env.local";
  let text = "";

  try {
    if (existsSync(file)) text = readFileSync(file, "utf8");
  } catch {
    text = "";
  }

  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  const line = `${name}=${normalized}`;
  const rows = text.length > 0 ? text.split(/\r?\n/) : [];
  let found = false;

  const nextRows = rows.map((row) => {
    if (row.startsWith(`${name}=`)) {
      found = true;
      return line;
    }
    return row;
  });

  if (!found) nextRows.push(line);

  writeFileSync(file, `${nextRows.filter(Boolean).join("\n")}\n`, "utf8");
}
