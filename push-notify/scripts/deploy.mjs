// Deploys the built extension to a Directus server over SSH and restarts it.
// Copies the FILE (never the folder) into the container: `docker cp` of a
// directory whose destination already exists nests it (dist/dist/index.js)
// and Directus silently keeps running the old build — see
// context/architecture.md's push-notify entry for how that bit us once.
//
// Usage (from push-notify/):
//   node scripts/deploy.mjs [--host root@srv1757570] [--container directus]
//
// Prompts for the SSH password like any other scp/ssh call in this project;
// set up `ssh-copy-id` once to skip that.
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const host = flag("host", "root@srv1757570");
const container = flag("container", "directus");
const stageDir = `/root/push-notify-stage-${container}`;

function run(cmd, cmdArgs) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit" });
}

// scp can't mkdir -p on the far side, so ensure the staging dir exists first.
run("ssh", [host, `mkdir -p ${stageDir}`]);
run("scp", ["dist/index.js", `${host}:${stageDir}/index.js`]);
run("ssh", [
  host,
  [
    `docker cp ${stageDir}/index.js ${container}:/directus/extensions/push-notify/dist/index.js`,
    `docker exec ${container} test -f /directus/extensions/push-notify/dist/index.js`,
    `docker compose -f /root/kudafellas-stack/docker-compose.yml restart ${container}`,
  ].join(" && "),
]);
console.log(`\nDeployed to ${host} (${container}). Verify with:`);
console.log(`  ssh ${host} "docker logs --tail 30 ${container} | grep push-notify"`);
