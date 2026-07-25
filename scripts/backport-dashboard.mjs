#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const upstreamRemote =
	process.env.UPSTREAM_DASHBOARD_REMOTE ?? 'https://github.com/FyraStack/dashboard.git';
const upstreamRef = process.env.UPSTREAM_DASHBOARD_REF ?? 'main';
const outputDir = resolve(root, '.local/backports');

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
		...options
	});
}

function usage() {
	console.log(`Usage:
  node scripts/backport-dashboard.mjs status
  node scripts/backport-dashboard.mjs plan <commit-or-range>
  node scripts/backport-dashboard.mjs plan-since-fork
  node scripts/backport-dashboard.mjs apply <commit-or-range>
  node scripts/backport-dashboard.mjs apply-since-fork

Environment:
  UPSTREAM_DASHBOARD_REMOTE  default: ${upstreamRemote}
  UPSTREAM_DASHBOARD_REF     default: ${upstreamRef}

The plan command never modifies source files. It writes a patch and metadata
under .local/backports/. Apply requires a clean working tree.`);
}

function ensureFetched() {
	console.log(`Fetching ${upstreamRemote} ${upstreamRef}...`);
	run('git', ['fetch', '--no-tags', upstreamRemote, upstreamRef], { capture: false });
}

function status() {
	ensureFetched();
	const local = run('git', ['rev-parse', 'HEAD']).trim();
	const upstream = run('git', ['rev-parse', 'FETCH_HEAD']).trim();
	const split = run('git', ['merge-base', local, upstream]).trim();
	const splitDetails = run('git', [
		'--no-pager',
		'show',
		'--no-patch',
		'--format=%H%n%cs%n%s',
		split
	])
		.trim()
		.split('\n');
	const upstreamSinceSplit = run('git', [
		'--no-pager',
		'log',
		'--oneline',
		'--decorate',
		'--date=short',
		'--date-order',
		`${split}..${upstream}`
	]);
	const upstreamMissing = run('git', [
		'--no-pager',
		'log',
		'--oneline',
		'--decorate',
		'--date=short',
		'--date-order',
		`${local}..${upstream}`
	]);
	const localSinceSplit = run('git', [
		'--no-pager',
		'log',
		'--oneline',
		'--decorate',
		'--date=short',
		'--date-order',
		`${split}..${local}`
	]);
	console.log(`Local:    ${local}\nUpstream: ${upstream}`);
	console.log(`\nFork point: ${splitDetails[0]} (${splitDetails[1]}) ${splitDetails[2]}`);
	console.log(`\nUpstream commits since fork (${countLines(upstreamSinceSplit)}):`);
	console.log(upstreamSinceSplit || 'None.');
	console.log(`\nUpstream commits not in local fork (${countLines(upstreamMissing)}):`);
	console.log(upstreamMissing || 'None; the local fork contains all upstream commits.');
	console.log(`\nLocal commits since fork (${countLines(localSinceSplit)}):`);
	console.log(localSinceSplit || 'None.');
}

function countLines(value) {
	return value.trim() ? value.trim().split('\n').length : 0;
}

function getHistory() {
	const local = run('git', ['rev-parse', 'HEAD']).trim();
	const upstream = run('git', ['rev-parse', 'FETCH_HEAD']).trim();
	const split = run('git', ['merge-base', local, upstream]).trim();
	return { local, upstream, split };
}

function planSinceFork() {
	ensureFetched();
	const { local, upstream, split } = getHistory();
	mkdirSync(outputDir, { recursive: true });
	const patchPath = resolve(outputDir, 'since-fork.patch');
	const metadataPath = resolve(outputDir, 'since-fork.json');
	const commits = run('git', [
		'--no-pager',
		'log',
		'--reverse',
		'--format=%H',
		'--no-merges',
		`${split}..${upstream}`
	])
		.trim()
		.split('\n')
		.filter(Boolean);
	const patch = commits.length
		? run('git', [
				'format-patch',
				'--stdout',
				'--binary',
				...commits.map((commit) => `${commit}^!`)
			])
		: '';
	const files = commits.map((commit) => ({
		commit,
		subject: run('git', ['show', '--no-patch', '--format=%s', commit]).trim(),
		files: run('git', ['diff-tree', '--no-commit-id', '--name-status', '-r', commit])
			.trim()
			.split('\n')
			.filter(Boolean)
	}));
	writeFileSync(patchPath, patch);
	writeFileSync(
		metadataPath,
		JSON.stringify(
			{
				upstreamRemote,
				upstreamRef,
				forkPoint: split,
				local,
				upstream,
				excludesMergeCommits: true,
				commitCount: commits.length,
				commits: files
			},
			null,
			2
		) + '\n'
	);
	console.log(`Patch: ${patchPath}\nMetadata: ${metadataPath}`);
	console.log(`Prepared ${commits.length} non-merge upstream commits since fork ${split}.`);
}

function plan(revision) {
	if (!revision) throw new Error('A commit or range is required.');
	ensureFetched();
	mkdirSync(outputDir, { recursive: true });
	const safeName = revision.replace(/[^a-zA-Z0-9._-]+/g, '_');
	const patchPath = resolve(outputDir, `${safeName}.patch`);
	const metadataPath = resolve(outputDir, `${safeName}.json`);

	const resolved = run('git', ['rev-parse', revision]).trim();
	const files = run('git', ['diff-tree', '--no-commit-id', '--name-status', '-r', resolved]);
	const commit = run('git', ['show', '--no-patch', '--format=%H%n%s%n%an', resolved])
		.trim()
		.split('\n');
	const patchContent = run('git', ['format-patch', '--stdout', '--binary', `${resolved}^!`]);
	writeFileSync(patchPath, patchContent);
	writeFileSync(
		metadataPath,
		JSON.stringify(
			{
				upstreamRemote,
				upstreamRef,
				commit: commit[0],
				subject: commit[1],
				author: commit[2],
				files: files.trim().split('\n').filter(Boolean)
			},
			null,
			2
		) + '\n'
	);
	console.log(`Patch: ${patchPath}\nMetadata: ${metadataPath}\n\n${files}`);
}

function applySinceFork() {
	const statusOutput = run('git', ['status', '--short']).trim();
	if (statusOutput) {
		throw new Error(
			'Refusing bulk backport with a dirty working tree. Save or stash current work, then rerun apply-since-fork.'
		);
	}
	ensureFetched();
	const { upstream, split } = getHistory();
	console.log(`Applying non-merge upstream commits from ${split} through ${upstream}.`);
	console.log('No commit will be created; review and test the resulting working tree.');
	run('git', ['cherry-pick', '--no-commit', '--no-merges', `${split}..${upstream}`], {
		capture: false
	});
}

function apply(revision) {
	if (!revision) throw new Error('A commit or range is required.');
	const statusOutput = run('git', ['status', '--short']).trim();
	if (statusOutput) {
		throw new Error(
			'Refusing to apply a backport with a dirty working tree. Save or stash current work first.'
		);
	}
	ensureFetched();
	console.log(
		`Applying upstream revision ${revision}. Resolve path conflicts manually if the collapsed layout differs.`
	);
	run('git', ['cherry-pick', '--no-commit', revision], { capture: false });
	console.log('Changes are staged in the working tree for review; no commit was created.');
}

const [command, revision] = process.argv.slice(2);
try {
	if (command === 'status') status();
	else if (command === 'plan') plan(revision);
	else if (command === 'plan-since-fork') planSinceFork();
	else if (command === 'apply') apply(revision);
	else if (command === 'apply-since-fork') applySinceFork();
	else {
		usage();
		process.exitCode = command ? 2 : 0;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
