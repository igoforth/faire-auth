import { handle } from "hono/vercel";
import { auth } from "../src/auth";

export const config = { runtime: "edge" };
export default handle(auth.app);
