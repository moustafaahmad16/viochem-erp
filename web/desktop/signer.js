// The e-seal signer from the website (web/signer/viochem-signer.ps1), run by the app in the
// background on Windows. The server asks it to sign each version 1.0 invoice, with a password only
// the app knows, so invoices sent from any device on the Wi-Fi are signed on this computer.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 8765;
let child = null;
let token = "";

const running = () => Boolean(child && child.exitCode === null);

async function status() {
  try {
    const res = await fetch(`http://localhost:${PORT}/status`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Starts the signer and waits for it, up to two minutes, while Windows asks for the token's PIN. */
async function start(serverDir, dataDir, signerToken, origin) {
  if (process.platform !== "win32") return { ok: false, message: "The e-seal signer runs on Windows only." };
  if (running()) return { ok: true, message: "" };
  token = signerToken;
  const script = fs
    .readFileSync(path.join(serverDir, "signer", "viochem-signer.ps1"), "utf8")
    .replace("__VIOCHEM_ORIGIN__", origin)
    .replace("$Token = ''", `$Token = '${signerToken}'`);
  const file = path.join(dataDir, "viochem-signer.ps1");
  fs.writeFileSync(file, script);
  let output = "";
  child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", file], { windowsHide: true });
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const until = Date.now() + 120_000;
  while (Date.now() < until && running()) {
    const s = await status();
    if (s?.ok) return { ok: true, message: `E-seal: ${s.subject}\nValid until ${s.validUntil}` };
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  const reason = output.split(/\r?\n/).find((l) => /No e-seal|Exception|Error/i.test(l)) ?? "It didn't answer in time.";
  return { ok: false, message: `${reason.trim()}\n\nPlug in the USB token, check its driver is installed, and try again.` };
}

function stop() {
  if (running()) child.kill();
  child = null;
}

module.exports = { PORT, start, stop, running };
