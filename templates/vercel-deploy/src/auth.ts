import { faireAuth } from "faire-auth";
import { options } from "./auth.options";

export const auth = faireAuth(options);
export const App = auth.$Infer.App(options);
export const Api = auth.$Infer.Api(App);
export const handler = auth.handler;
export type App = typeof App;
