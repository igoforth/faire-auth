import * as z from "zod";
import { dateOrIsoStringSchema } from "../../factory/schema";

export const coreSchema = z.object({
	id: z.string(),
	createdAt: dateOrIsoStringSchema.default(() => new Date()),
	updatedAt: dateOrIsoStringSchema.default(() => new Date()),
});
