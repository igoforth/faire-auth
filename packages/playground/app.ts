import { faireAuth } from "faire-auth";
import { aPluginClient, cfg, pluginClient } from "./config";
import { createAuthClient } from "faire-auth/client";

const { $Infer } = faireAuth(cfg);
export const App = $Infer.App(cfg);
export const Api = $Infer.Api(App);

const cl = createAuthClient<typeof App>()({
	plugins: [pluginClient(), aPluginClient()],
});

const _res1 = await Api.changeEmail();
const _res2 = await cl.changeEmail.$post();
