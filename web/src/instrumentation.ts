// Runs once when the server starts. On the Windows app, it brings the database file up to date
// and starts the daily backups. The website needs nothing here.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.VIOCHEM_DATA_DIR) return;
  const { startDesktop } = await import("@/lib/desktop/start");
  await startDesktop();
}
