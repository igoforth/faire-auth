import { handle } from "hono/vercel";
import { auth } from "../src/auth";

export default handle(auth.app);
