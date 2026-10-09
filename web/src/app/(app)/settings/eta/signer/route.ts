import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";

/**
 * The e-seal signer for the computer the USB token is plugged into, as one file to double-click.
 * A small batch header starts PowerShell on the script below it, which only accepts requests from
 * the address it was downloaded from.
 */
export async function GET(request: Request) {
  await requireAdmin();
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const script = (await readFile(path.join(process.cwd(), "signer", "viochem-signer.ps1"), "utf8")).replace("__VIOCHEM_ORIGIN__", origin);
  const launcher = [
    "@echo off",
    "title VIOCHEM e-seal signer",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath '%~f0' -Raw; Invoke-Expression $s.Substring($s.IndexOf('#' + 'PS1'))"`,
    "pause",
    "exit /b",
    "#PS1",
  ].join("\r\n");
  const body = `${launcher}\r\n${script.replace(/\r?\n/g, "\r\n")}`;
  return new Response(body, {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="viochem-signer.bat"', "Cache-Control": "no-store" },
  });
}
