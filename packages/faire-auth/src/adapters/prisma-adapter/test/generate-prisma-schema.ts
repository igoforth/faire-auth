import type { FaireAuthOptions } from "../../../types";
import type { DBAdapter } from "@faire-auth/core/db/adapter";
import type { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import { join } from "path";
import { prismaAdapter } from "../prisma-adapter";
import { getConnectionString } from "../../../test-utils/test-connection";
import { inject } from "vitest";

export async function generatePrismaSchema(
	faireAuthOptions: FaireAuthOptions,
	db: PrismaClient,
	iteration: number,
	dialect: "sqlite" | "postgresql" | "mysql",
) {
	const i = async (x: string) => await import(x);
	const { generateSchema } = (await i(
		"./../../../../../cli/src/generators/index",
	)) as {
		generateSchema: (opts: {
			adapter: DBAdapter<FaireAuthOptions>;
			file?: string;
			options: FaireAuthOptions;
		}) => Promise<{
			code: string | undefined;
			fileName: string;
			overwrite: boolean | undefined;
		}>;
	};

	const prismaDB = prismaAdapter(db, { provider: dialect });
	let { fileName, code } = await generateSchema({
		file: join(import.meta.dirname, `schema-${dialect}.prisma`),
		adapter: prismaDB({}),
		options: { ...faireAuthOptions, database: prismaDB },
	});
	if (dialect === "postgresql") {
		code = code?.replace(
			`env("DATABASE_URL")`,
			`"${getConnectionString(inject("postgresPrisma"))}"`,
		);
	} else if (dialect === "mysql") {
		code = code?.replace(
			`env("DATABASE_URL")`,
			`"${getConnectionString(inject("mysqlPrisma"))}"`,
		);
	}
	code = code
		?.split("\n")
		.map((line, index) => {
			if (index === 2) {
				return (
					line + `\n  output   = "./.tmp/prisma-client-${dialect}-${iteration}"`
				);
			}
			return line;
		})
		.join("\n");
	await fs.writeFile(fileName, code || "", "utf-8");
}
