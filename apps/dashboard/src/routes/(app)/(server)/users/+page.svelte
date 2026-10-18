<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		createManagedHostUser,
		listManagedHostUsers,
		type HostSummary,
		type ManagedHostUser
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
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
			error = getErrorMessage(err, 'Failed to load host users.');
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
			error = getErrorMessage(err, 'Failed to create host user.');
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col overflow-auto bg-background">
	<div class="border-b border-border px-5 py-4">
		<h1 class="text-base font-semibold text-foreground">Host Users</h1>
		<p class="mt-1 text-xs text-muted-foreground">
			Manage local accounts on {host.hostname ?? 'this server'}. Anyone with an account and a
			password can sign in to the dashboard; Tetra decides what each account may see.
		</p>
	</div>

	<div class="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<section class="min-w-0 space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-foreground">Local accounts</h2>
					<p class="text-xs text-muted-foreground">Read from the Tetra users module.</p>
				</div>
				<Button variant="outline" size="sm" onclick={refresh} disabled={loading}>
					{#if loading}<Loader2 class="size-3 animate-spin" />{:else}<RefreshCw
							class="size-3"
						/>{/if}
					Refresh
				</Button>
			</div>

			<div class="overflow-hidden rounded-md border border-border/60">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
						<tr
							><th class="px-3 py-2">Name</th><th class="px-3 py-2">UID</th><th class="px-3 py-2"
								>Home</th
							><th class="px-3 py-2">Shell</th></tr
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
				<h2 class="text-sm font-semibold text-foreground">Create host user</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Set a password on the console with <code class="font-mono">passwd</code> before the account
					can sign in.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="username">Username</Label><Input
					id="username"
					bind:value={username}
					placeholder="alice"
					required
				/>
			</div>
			<div class="space-y-2">
				<Label for="shell">Shell</Label><Input id="shell" bind:value={shell} />
			</div>
			<div class="space-y-2">
				<Label for="home">Home directory</Label><Input
					id="home"
					bind:value={home}
					placeholder="/home/alice"
				/>
			</div>
			<Button type="submit" class="w-full" disabled={creating || !username.trim()}
				>{#if creating}<Loader2 class="size-4 animate-spin" />{:else}<UserPlus
						class="size-4"
					/>{/if}Create user</Button
			>
		</form>
	</div>

	{#if error}<div
			class="mx-5 mb-5 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
		>
			{error}
		</div>{/if}
</div>
