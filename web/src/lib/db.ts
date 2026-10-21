import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** True when the data is in a SQLite file (the Windows app) rather than PostgreSQL (the website). */
export const isSqlite = () => (process.env.DATABASE_URL ?? "").startsWith("file:");

/** Names match regardless of case. Compared here because PostgreSQL and SQLite compare text differently. */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
