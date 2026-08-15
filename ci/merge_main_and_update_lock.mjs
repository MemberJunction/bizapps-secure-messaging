import { simpleGit } from 'simple-git';
import { execSync } from 'child_process';
import fs from 'fs';

const git = simpleGit();

// Step 1: Merge main into next
console.log('Fetching and merging main branch...');
await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

// Step 2: Update pnpm-lock.yaml with new versions
const LOCKFILE = 'pnpm-lock.yaml';
console.log(`\nUpdating ${LOCKFILE} with new package versions...`);
try {
  // --lockfile-only resolves and rewrites the lockfile without touching node_modules,
  // which is the pnpm equivalent of npm's --package-lock-only.
  execSync('pnpm install --lockfile-only', { stdio: 'inherit' });

  const status = await git.status();
  const lockFileModified = status.modified.includes(LOCKFILE) ||
                          status.not_added.includes(LOCKFILE);

  if (lockFileModified) {
    console.log(`${LOCKFILE} has been updated with new versions`);

    const entitiesPkg = JSON.parse(fs.readFileSync('packages/Entities/package.json', 'utf8'));
    const version = entitiesPkg.version;

    await git.add(LOCKFILE);
    await git.commit(
      `chore: Update ${LOCKFILE} with v${version} dependencies\n\n` +
      `Updates @mj-biz-apps/* package versions in lock file after publishing v${version}`
    );
    console.log(`Committed ${LOCKFILE} updates`);
  } else {
    console.log(`No changes to ${LOCKFILE} needed`);
  }
} catch (error) {
  console.error(`Error updating ${LOCKFILE}:`, error);
  console.log(`Continuing despite ${LOCKFILE} update error...`);
}

// Step 3: Push to next
console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log(`Successfully merged main and updated ${LOCKFILE} in next branch`);
