import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { waitUntil } from "../utils/waitUntil";

const execAsync = promisify(exec);

// Find the repository root by looking for docker-compose.yml
function findRepoRoot(): string {
	// Start from the current file's directory
	let currentDir = dirname(fileURLToPath(import.meta.url));

	// Walk up the directory tree until we find docker-compose.yml
	while (currentDir !== dirname(currentDir)) {
		const dockerComposePath = join(currentDir, "docker-compose.yml");
		if (existsSync(dockerComposePath)) {
			return currentDir;
		}
		currentDir = dirname(currentDir);
	}

	// Fallback: try to resolve from process.cwd()
	const fallbackPath = resolve(process.cwd(), "../../docker-compose.yml");
	if (existsSync(fallbackPath)) {
		return dirname(fallbackPath);
	}

	throw new Error("Could not find docker-compose.yml in repository");
}

const REPO_ROOT = findRepoRoot();
const DOCKER_COMPOSE_FILE = join(REPO_ROOT, "docker-compose.yml");

let composeProcess: ChildProcess;

// async function checkAllContainersHealthy(): Promise<boolean> {
// 	try {
// 		// Get all container IDs from the compose project
// 		const { stdout: containersOutput } = await execAsync(
// 			"docker compose ps -q",
// 		);

// 		const containerIds = containersOutput
// 			.trim()
// 			.split("\n")
// 			.filter((id) => id.length > 0);

// 		if (containerIds.length === 0) {
// 			return false;
// 		}

// 		// Check health status of each container
// 		for (const containerId of containerIds) {
// 			const { stdout: inspectOutput } = await execAsync(
// 				`docker inspect --format='{{.State.Health.Status}}' ${containerId}`,
// 			);

// 			const healthStatus = inspectOutput.trim().replace(/'/g, "");

// 			// If container has no healthcheck, check if it's running
// 			if (healthStatus === "<no value>") {
// 				const { stdout: stateOutput } = await execAsync(
// 					`docker inspect --format='{{.State.Status}}' ${containerId}`,
// 				);
// 				const state = stateOutput.trim().replace(/'/g, "");
// 				if (state !== "running") {
// 					return false;
// 				}
// 			} else if (healthStatus !== "healthy") {
// 				return false;
// 			}
// 		}

// 		return true;
// 	} catch (e) {
// 		return false;
// 	}
// }

async function checkAllContainersHealthy(): Promise<boolean> {
	try {
		// Get all container IDs from the compose project
		const { stdout: containersOutput } = await execAsync(
			`docker compose -f "${DOCKER_COMPOSE_FILE}" ps -q`,
		);

		const containerIds = containersOutput
			.trim()
			.split("\n")
			.filter((id) => id.length > 0);

		if (containerIds.length === 0) {
			return false;
		}

		// Check health status of each container
		for (const containerId of containerIds) {
			const { stdout: inspectOutput } = await execAsync(
				`docker inspect --format='{{.State.Health.Status}}' ${containerId}`,
			);

			const healthStatus = inspectOutput.trim().replace(/'/g, "");

			// If container is explicitly unhealthy, throw an error
			if (healthStatus === "unhealthy") {
				const { stdout: nameOutput } = await execAsync(
					`docker inspect --format='{{.Name}}' ${containerId}`,
				);
				const containerName = nameOutput.trim().replace(/^\//, "");

				throw new Error(
					`Container ${containerName} (${containerId}) is unhealthy`,
				);
			}

			// If container has no healthcheck, check if it's running
			if (healthStatus === "<no value>") {
				const { stdout: stateOutput } = await execAsync(
					`docker inspect --format='{{.State.Status}}' ${containerId}`,
				);
				const state = stateOutput.trim().replace(/'/g, "");
				if (state !== "running") {
					return false;
				}
			} else if (healthStatus !== "healthy") {
				// Still starting up
				return false;
			}
		}

		return true;
	} catch (e) {
		// Re-throw if it's our unhealthy container error
		if (e instanceof Error && e.message.includes("is unhealthy")) {
			throw e;
		}
		return false;
	}
}

export async function setup(project: TestProject) {
	console.log(`Starting Docker Compose from: ${DOCKER_COMPOSE_FILE}`);

	// Start Docker Compose services
	composeProcess = spawn("docker", ["compose", "-f", DOCKER_COMPOSE_FILE, "up", "-d"], {
		stdio: "inherit",
	});

	// Wait for the spawn command to complete
	await new Promise<void>((resolve, reject) => {
		composeProcess.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`docker compose up failed with code ${code}`));
			}
		});
		composeProcess.on("error", reject);
	});

	// Wait for all containers to be healthy
	await waitUntil(checkAllContainersHealthy, {
		timeout: 60000, // 60 seconds for containers to start and become healthy
		interval: 1000, // Check every second
	});
}

export async function teardown(project: TestProject) {
	try {
		// Stop and remove containers, networks, and volumes
		const downProcess = spawn("docker", ["compose", "-f", DOCKER_COMPOSE_FILE, "down", "-v"], {
			stdio: "inherit",
		});

		// Wait for down command to complete
		await new Promise<void>((resolve, reject) => {
			downProcess.on("exit", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`docker compose down failed with code ${code}`));
				}
			});
			downProcess.on("error", reject);
		});

		// Wait for all containers to be removed
		await waitUntil(
			async () => {
				try {
					const { stdout } = await execAsync(
						`docker compose -f "${DOCKER_COMPOSE_FILE}" ps -q`,
					);
					return stdout.trim().length === 0;
				} catch (e) {
					return true; // If command fails, assume everything is down
				}
			},
			{
				timeout: 30000, // 30 second timeout for shutdown
				interval: 500,
			},
		);
	} catch (error) {
		console.error("Error during Docker Compose teardown:", error);
	}
}
