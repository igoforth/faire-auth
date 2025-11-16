import type { FaireAuthOptions } from "../../../types";
import fs from "fs/promises";
import path from "path";

export const generateAuthConfigFile = async (_options: FaireAuthOptions) => {
	const options = { ..._options };
	// biome-ignore lint/performance/noDelete: perf doesn't matter here.
	delete options.database;
	let code = `import { faireAuth } from "../../../auth";
import { prismaAdapter } from "../prisma-adapter";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

export const auth = faireAuth({
    database: prismaAdapter(db, {
	    provider: 'sqlite'
    }),
    ${JSON.stringify(options, null, 2).slice(1, -1)}
})`;

	await fs.writeFile(path.join(import.meta.dirname, "auth.ts"), code);
};
