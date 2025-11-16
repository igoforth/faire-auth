import { WorkerEntrypoint } from "cloudflare:workers";
import { Api, handler } from "./auth";

export default class WorkerEntry extends WorkerEntrypoint<CloudflareEnv> {
	changeEmail;
	changePassword;
	deleteUser;
	getAccessToken;
	getAccountInfo;
	getSession;
	linkAccount;
	listAccounts;
	listSessions;
	refreshAccessToken;
	requestPasswordReset;
	resetPassword;
	revokeOtherSessions;
	revokeSession;
	revokeSessions;
	sendVerificationEmail;
	setPassword;
	signInEmail;
	signInSocial;
	signOut;
	signUpEmail;
	unlinkAccount;
	updateUser;
	verifyEmail;

	constructor(ctx: ExecutionContext, env: CloudflareEnv) {
		super(ctx, env);

		this.changeEmail = Api.changeEmail<false, false>;
		this.changePassword = Api.changePassword<false, false>;
		this.deleteUser = Api.deleteUser<false, false>;
		this.getAccessToken = Api.getAccessToken<false, false>;
		this.getAccountInfo = Api.getAccountInfo<false, false>;
		this.getSession = Api.getSession<false, false>;
		this.linkAccount = Api.linkAccount<false, false>;
		this.listAccounts = Api.listAccounts<false, false>;
		this.listSessions = Api.listSessions<false, false>;
		this.refreshAccessToken = Api.refreshAccessToken<false, false>;
		this.requestPasswordReset = Api.requestPasswordReset<false, false>;
		this.resetPassword = Api.resetPassword<false, false>;
		this.revokeOtherSessions = Api.revokeOtherSessions<false, false>;
		this.revokeSession = Api.revokeSession<false, false>;
		this.revokeSessions = Api.revokeSessions<false, false>;
		this.sendVerificationEmail = Api.sendVerificationEmail<false, false>;
		this.setPassword = Api.setPassword<false, false>;
		this.signInEmail = Api.signInEmail<false, false>;
		this.signInSocial = Api.signInSocial<false, false>;
		this.signOut = Api.signOut<false, false>;
		this.signUpEmail = Api.signUpEmail<false, false>;
		this.unlinkAccount = Api.unlinkAccount<false, false>;
		this.updateUser = Api.updateUser<false, false>;
		this.verifyEmail = Api.verifyEmail<false, false>;
	}

	async fetch(request: Request) {
		return handler(request, this.env, this.ctx);
	}
}
