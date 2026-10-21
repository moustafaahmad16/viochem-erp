import { PrismaClient } from "@prisma/client";

/** True when the data is in a SQLite file (the Windows app) rather than PostgreSQL (the website). */
export const isSqlite = () => (process.env.DATABASE_URL ?? "").startsWith("file:");

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// A SQLite file takes one writer at a time, so on the Windows app a transaction waits its turn
// behind someone else's rather than giving up after the usual two seconds.
export const db = globalForPrisma.prisma ?? new PrismaClient(isSqlite() ? { transactionOptions: { maxWait: 30_000 } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Names match regardless of case. Compared here because PostgreSQL and SQLite compare text differently. */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
