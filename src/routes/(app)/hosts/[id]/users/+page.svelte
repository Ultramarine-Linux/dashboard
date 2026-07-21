<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import {
		createManagedHostUser,
		listManagedHostUsers,
		regenerateManagedHostUserInvitation,
		type ManagedHost,
		type ManagedHostUser
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Copy from '~icons/lucide/copy';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import UserPlus from '~icons/lucide/user-plus';

	type PageData = { host: ManagedHost };
	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let users = $state<ManagedHostUser[]>([]);
	let loading = $state(false);
	let creating = $state(false);
	let error = $state('');
	let username = $state('');
	let shell = $state('/bin/bash');
	let home = $state('');
	let createDashboardUser = $state(false);
	let email = $state('');
	let invitationLink = $state('');
	let loadedHostId = $state<string | null>(null);

	$effect(() => {
		if (loadedHostId === host.id) return;
		loadedHostId = host.id;
		refresh();
	});

	async function refresh() {
		if (loading) return;
		loading = true;
		error = '';
		try {
			users = await listManagedHostUsers({ hostId: host.id });
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
		invitationLink = '';
		try {
			const result = await createManagedHostUser({
				hostId: host.id,
				username,
				shell: shell.trim() || undefined,
				home: home.trim() || undefined,
				createDashboardUser,
				email: createDashboardUser ? email.trim() : undefined
			});
			invitationLink = result.invitationUrl ?? '';
			username = '';
			home = '';
			if (!result.invitationUrl) await refresh();
		} catch (err) {
			error = getErrorMessage(err, 'Failed to create host user.');
		} finally {
			creating = false;
		}
	}

	async function regenerateInvitation() {
		if (!username.trim() || !email.trim()) return;
		error = '';
		try {
			const result = await regenerateManagedHostUserInvitation({
				hostId: host.id,
				username: username.trim(),
				email: email.trim()
			});
			invitationLink = result.invitationUrl;
		} catch (err) {
			error = getErrorMessage(err, 'Failed to regenerate invitation.');
		}
	}

	async function copyInvitation() {
		if (!invitationLink) return;
		await navigator.clipboard.writeText(invitationLink);
	}
</script>

<div class="flex h-full min-h-0 flex-col overflow-auto bg-background">
	<div class="border-b border-border px-5 py-4">
		<h1 class="text-base font-semibold text-foreground">Host Users</h1>
		<p class="mt-1 text-xs text-muted-foreground">
			Manage local accounts on {host.displayName}. Host mutations require an elevated Tetra agent.
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
					Optionally issue a dashboard invite for the same person.
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
			<div class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
				<Label for="dashboard-user">Create dashboard user too</Label><Switch
					id="dashboard-user"
					checked={createDashboardUser}
					onCheckedChange={(checked) => (createDashboardUser = checked)}
				/>
			</div>
			{#if createDashboardUser}<div class="space-y-2">
					<Label for="email">Invitation email</Label><Input
						id="email"
						type="email"
						bind:value={email}
						required
					/>
				</div>{/if}
			<Button
				type="submit"
				class="w-full"
				disabled={creating || !username.trim() || (createDashboardUser && !email.trim())}
				>{#if creating}<Loader2 class="size-4 animate-spin" />{:else}<UserPlus
						class="size-4"
					/>{/if}Create user</Button
			>
			{#if invitationLink}
				<div class="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
					<p class="text-xs font-medium text-foreground">
						Copy this invitation link now. Regenerating it revokes the previous link.
					</p>
					<Input value={invitationLink} readonly />
					<div class="flex gap-2">
						<Button type="button" size="sm" variant="outline" onclick={copyInvitation}
							><Copy class="size-3" />Copy</Button
						><Button type="button" size="sm" variant="outline" onclick={regenerateInvitation}
							>Regenerate</Button
						>
					</div>
				</div>
			{/if}
		</form>
	</div>

	{#if error}<div
			class="mx-5 mb-5 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
		>
			{error}
		</div>{/if}
</div>
