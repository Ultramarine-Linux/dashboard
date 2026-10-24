<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { HostSummary } from '$lib/remote/managed-hosts.remote';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import { hostTabHref, visibleHostTabs, type HostTab } from '$lib/hosts/host-detail';

	type LayoutData = { host: HostSummary };

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let refreshing = $state(false);

	const tabs = $derived(visibleHostTabs(page.data.permissions, page.data.featureFlags));

	let activeTab = $derived.by<HostTab | null>(() => {
		const tab = page.url.pathname.slice(1).split('/')[0];
		return tabs.some((entry) => entry.id === tab) ? (tab as HostTab) : null;
	});

	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await invalidate('app:local-host');
		} finally {
			refreshing = false;
		}
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<div class="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
		<div class="flex min-w-0 items-center gap-2">
			<span class="truncate text-sm font-medium text-foreground">
				{data.host.hostname ?? 'This server'}
			</span>
			{#if data.host.os}
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					{data.host.os}
				</span>
			{/if}
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
		{#each tabs as tab (tab.id)}
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

	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
		{@render children()}
	</div>
</div>
