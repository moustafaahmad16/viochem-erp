// Builds the server for the Windows app into desktop/app: Next.js as a standalone folder, with the
// Prisma client for SQLite, the SQLite migrations and the e-seal signer beside it.
// Run on Windows (the release workflow does), so the database engine built for Windows is the one included.
import { execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
const app = path.join(import.meta.dirname, "app");
const run = (cmd, env = {}) => execSync(cmd, { cwd: web, stdio: "inherit", env: { ...process.env, ...env } });

run("node scripts/sqlite-schema.mjs");
run("npx prisma generate --schema prisma/sqlite/schema.prisma");
// The build reads no data, but Prisma wants a database address to be set.
run("npx next build", { VIOCHEM_STANDALONE: "1", DATABASE_URL: "file:./build.db" });

rmSync(app, { recursive: true, force: true });
cpSync(path.join(web, ".next/standalone"), app, { recursive: true });
materialize(app);
cpSync(path.join(web, ".next/static"), path.join(app, ".next/static"), { recursive: true });
cpSync(path.join(web, "public"), path.join(app, "public"), { recursive: true });
cpSync(path.join(web, "prisma/sqlite/migrations"), path.join(app, "prisma/sqlite/migrations"), { recursive: true });
cpSync(path.join(web, "signer"), path.join(app, "signer"), { recursive: true });
// The query engines, in case the build's file tracing missed the one for the other platform.
const engines = path.join(web, "node_modules/.prisma/client");
for (const f of readdirSync(engines).filter((f) => f.endsWith(".node") || f === "schema.prisma")) {
  cpSync(path.join(engines, f), path.join(app, "node_modules/.prisma/client", f));
}
// Image resizing isn't used (pictures are plain <img>), so its 45 MB library stays out of the installer.
for (const dir of ["node_modules/sharp", "node_modules/@img"]) rmSync(path.join(app, dir), { recursive: true, force: true });
// Settings for the website must not leak into the app.
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

// Put the website's PostgreSQL client back, so working on the website carries on as before.
run("npx prisma generate");
if (!existsSync(path.join(app, "server.js"))) throw new Error("The standalone server wasn't built.");
console.log(`Server ready in ${app}`);

/** The build links some packages to where it ran (.next/node_modules); the app needs real copies it can carry. */
function materialize(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = lstatSync(p);
    if (s.isSymbolicLink()) {
      const target = realpathSync(p);
      rmSync(p, { recursive: true, force: true });
      cpSync(target, p, { recursive: true, dereference: true });
      materialize(p);
    } else if (s.isDirectory()) {
      materialize(p);
    }
  }
}
