import type { DBAdapter, FaireAuthOptions } from "faire-auth";

export interface SchemaGenerator {
	<Options extends FaireAuthOptions>(opts: {
		file?: string;
		adapter: DBAdapter;
		options: Options;
	}): Promise<{
		code?: string;
		fileName: string;
		overwrite?: boolean;
		append?: boolean;
	}>;
}
