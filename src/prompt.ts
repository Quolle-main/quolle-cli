import { createInterface } from "node:readline";

/** Prompt for a line of visible input. */
export function question(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt for a secret (input hidden, no echo). Falls back to visible on non-TTY. */
export function secret(query: string): Promise<string> {
  if (!process.stdin.isTTY) return question(query);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch: string) => {
      for (const char of ch) {
        if (char === "\n" || char === "\r" || char === "") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(buf.trim());
          return;
        } else if (char === "") {
          // Ctrl-C
          process.stdout.write("\n");
          process.exit(130);
        } else if (char === "" || char === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}
