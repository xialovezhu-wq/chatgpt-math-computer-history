import { spawn } from "node:child_process";
import readline from "node:readline";

const client = "/Users/USER_NAME/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient";
const toolName = process.argv[2] ?? "computer_history_status";
const toolArguments = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const child = spawn(client, ["computer-history", "mcp"], {
  stdio: ["pipe", "pipe", "ignore"],
});
const lines = readline.createInterface({ input: child.stdout });
let finished = false;

function finish(code, output = "") {
  if (finished) return;
  finished = true;
  if (output) process.stdout.write(`${output}\n`);
  child.kill("SIGTERM");
  process.exitCode = code;
}

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === 1) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: toolArguments },
    })}\n`);
  } else if (message.id === 2) {
    const text = message.result?.content?.find((item) => item.type === "text")?.text;
    if (typeof text === "string") finish(0, text);
    else finish(1, JSON.stringify(message));
  }
});

child.on("error", () => finish(1));
child.stdin.write(`${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "codex-math-history-companion", version: "1.0.0" },
  },
})}\n`);

setTimeout(() => finish(1), 10_000).unref();
