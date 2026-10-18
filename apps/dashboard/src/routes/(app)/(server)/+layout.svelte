<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		enrollLocalTetra,
		refreshManagedHostCapabilities,
		type ManagedHost
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import Server from '~icons/nucleo/server';
	import { untrack } from 'svelte';
	import { hostTabHref, hostTabs, type HostTab } from '$lib/hosts/host-detail';

	type LayoutData = {
		host: ManagedHost | null;
		hostUserMapping: string | null;
	};

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let host = $state<ManagedHost | null>(untrack(() => data.host));
	let refreshing = $state(false);
	let connecting = $state(false);
	let actionError = $state('');

	$effect(() => {
		host = data.host;
	});

	const appsEnabled = $derived(page.data.featureFlags?.apps === true);

	let activeTab = $derived.by<HostTab>(() => {
		if (page.url.pathname === '/') return 'overview';
		const tab = page.url.pathname.slice(1).split('/')[0];
		return hostTabs.some((entry) => entry.id === tab) ? (tab as HostTab) : 'overview';
	});

	function stateVariant(state: ManagedHost['connectionState']) {
		if (state === 'online') return 'default';
		if (state === 'offline') return 'destructive';
		return 'secondary';
	}

	async function refresh() {
		if (refreshing) return;
		actionError = '';
		refreshing = true;
		try {
			host = await refreshManagedHostCapabilities();
			await invalidate('app:local-host');
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to refresh server.');
		} finally {
			refreshing = false;
		}
	}

	async function connect() {
		if (connecting) return;
		actionError = '';
		connecting = true;
		try {
			const connected = await enrollLocalTetra({ displayName: 'Local host' });
			if (!connected) {
				actionError = 'No local Tetra endpoint was found. Start Tetra and try again.';
				return;
			}
			await invalidate('app:local-host');
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to connect to Tetra.');
		} finally {
			connecting = false;
		}
	}
</script>

{#if !host}
	<div class="flex flex-1 items-center justify-center p-6 text-center">
		<div class="max-w-md">
			<div
				class="mx-auto flex size-10 items-center justify-center border border-border bg-muted/40"
			>
				<Server class="size-5 text-muted-foreground" />
			</div>
			<h1 class="mt-5 text-sm font-semibold text-foreground">Not connected to Tetra</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Dashboard manages this server through the local Tetra agent, but no connection has been set
				up yet. Make sure Tetra is running, then connect.
			</p>
			{#if actionError}
				<p
					class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-left text-xs text-destructive"
				>
					{actionError}
				</p>
			{/if}
			<Button class="mt-6 gap-2" onclick={connect} disabled={connecting}>
				{#if connecting}
					<Loader2 class="size-4 animate-spin" />
				{:else}
					<RefreshCw class="size-4" />
				{/if}
				Connect to Tetra
			</Button>
		</div>
	</div>
{:else}
	<div class="flex flex-1 flex-col overflow-hidden">
		<div class="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
			<div class="flex min-w-0 items-center gap-2">
				<span class="truncate text-sm font-medium text-foreground">{host.displayName}</span>
				<Badge variant={stateVariant(host.connectionState)} class="text-[10px]">
					{host.connectionState}
				</Badge>
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					{host.agentUrl ?? 'No agent URL'}
				</span>
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				<Button
					variant="outline"
					size="sm"
					class="h-7 gap-1.5 px-2.5 text-xs sm:px-3"
					onclick={refresh}
					disabled={refreshing}
				>
					{#if refreshing}
						<Loader2 class="h-3 w-3 animate-spin" />
					{:else}
						<RefreshCw class="h-3 w-3" />
					{/if}
					<span class="hidden sm:inline">Refresh</span>
					<span class="sr-only sm:hidden">Refresh server</span>
				</Button>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-border px-2">
			{#each hostTabs.filter((tab) => tab.id !== 'apps' || appsEnabled) as tab (tab.id)}
				<a
					aria-current={activeTab === tab.id ? 'page' : undefined}
					class="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors duration-100 {activeTab ===
					tab.id
						? 'border-b-2 border-primary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					href={resolve(hostTabHref(tab.id))}
					data-sveltekit-preload-data="hover"
				>
					<tab.icon class="h-3 w-3" />
					{tab.label}
				</a>
			{/each}
		</div>

		{#if actionError}
			<div
				class="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
			>
				{actionError}
			</div>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
			{@render children()}
		</div>
	</div>
{/if}
