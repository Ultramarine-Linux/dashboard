<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import {
		createManagedHostUser,
		listManagedHostUsers,
		type HostSummary,
		type ManagedHostUser
	} from '#lib/remote/managed-hosts.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import UserPlus from '~icons/lucide/user-plus';

	type PageData = { host: HostSummary };
	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let users = $state<ManagedHostUser[]>([]);
	let loading = $state(false);
	let creating = $state(false);
	let error = $state('');
	let username = $state('');
	let shell = $state('/bin/bash');
	let home = $state('');

	$effect(() => {
		untrack(() => refresh());
	});

	async function refresh() {
		if (loading) return;
		loading = true;
		error = '';
		try {
			users = await listManagedHostUsers();
		} catch (err) {
			error = getErrorMessage(err, t('users.loadFailed'));
		} finally {
			loading = false;
		}
	}

	async function createUser() {
		if (creating) return;
		creating = true;
		error = '';
		try {
			await createManagedHostUser({
				username,
				shell: shell.trim() || undefined,
				home: home.trim() || undefined
			});
			username = '';
			home = '';
			await refresh();
		} catch (err) {
			error = getErrorMessage(err, t('users.createFailed'));
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col overflow-auto bg-background">
	<div class="border-b border-border p-4 sm:p-6">
		<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('users.title')}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{host.hostname
				? t('users.description', { host: host.hostname })
				: t('users.descriptionThisServer')}
		</p>
	</div>

	<div class="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<section class="min-w-0 space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-foreground">{t('users.localAccounts')}</h2>
					<p class="text-xs text-muted-foreground">{t('users.localAccountsHint')}</p>
				</div>
				<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
					{#if loading}<Loader2 class="size-3 animate-spin" />{:else}<RefreshCw
							class="size-3"
						/>{/if}
					{t('common.refresh')}
				</Button>
			</div>

			<div class="overflow-hidden rounded-md border border-border/60">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
						<tr
							><th class="px-3 py-2">{t('common.name')}</th><th class="px-3 py-2">UID</th><th
								class="px-3 py-2">{t('users.home')}</th
							><th class="px-3 py-2">{t('users.shell')}</th></tr
						>
					</thead>
					<tbody class="divide-y divide-border/50">
						{#each users as account (account.name)}
							<tr
								><td class="px-3 py-2 font-medium">{account.name}</td><td
									class="px-3 py-2 text-muted-foreground">{account.uid}</td
								><td class="px-3 py-2 text-muted-foreground">{account.home}</td><td
									class="px-3 py-2 text-muted-foreground">{account.shell}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<form
			class="space-y-4 rounded-md border border-border/60 p-4"
			onsubmit={(event) => {
				event.preventDefault();
				createUser();
			}}
		>
			<div>
				<h2 class="text-sm font-semibold text-foreground">{t('users.createTitle')}</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					{t('users.passwordHintBefore')} <code class="font-mono">passwd</code>
					{t('users.passwordHintAfter')}
				</p>
			</div>
			<div class="space-y-2">
				<Label for="username">{t('users.username')}</Label><Input
					id="username"
					bind:value={username}
					placeholder="alice"
					required
				/>
			</div>
			<div class="space-y-2">
				<Label for="shell">{t('users.shell')}</Label><Input id="shell" bind:value={shell} />
			</div>
			<div class="space-y-2">
				<Label for="home">{t('users.homeDirectory')}</Label><Input
					id="home"
					bind:value={home}
					placeholder="/home/alice"
				/>
			</div>
			<Button type="submit" class="w-full" disabled={creating || !username.trim()}
				>{#if creating}<Loader2 class="size-4 animate-spin" />{:else}<UserPlus
						class="size-4"
					/>{/if}{t('users.createUser')}</Button
			>
		</form>
	</div>

	{#if error}<div
			class="mx-5 mb-5 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
		>
			{error}
		</div>{/if}
</div>
