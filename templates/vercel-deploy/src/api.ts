import { handle } from "hono/vercel";
import { auth } from "./auth";

export default handle(auth.app);
