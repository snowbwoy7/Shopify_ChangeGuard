import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const client = createClient({
  url: process.env.DATABASE_URL || "file:./dev.sqlite",
});

export const db = drizzle(client, { schema });
