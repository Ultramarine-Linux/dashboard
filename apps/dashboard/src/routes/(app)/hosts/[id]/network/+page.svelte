<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		getManagedHostNetwork,
		type ManagedHost,
		type ManagedHostNetworkResult
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';

	type PageData = { host: ManagedHost };
	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let result = $state<ManagedHostNetworkResult>({ interfaces: [], resolvConf: null, routes: [] });
	let loading = $state(false);
	let error = $state('');
	let loadedHostId = $state<string | null>(null);

	function record(value: unknown): Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	}

	function json(value: unknown) {
		return JSON.stringify(value ?? null, null, 2);
	}

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
			result = await getManagedHostNetwork({ hostId: host.id });
		} catch (err) {
			error = getErrorMessage(err, 'Failed to load network information.');
		} finally {
			loading = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-sm font-semibold text-foreground">Network</h1>
			<p class="mt-1 text-xs text-muted-foreground">
				Interfaces, DNS configuration, and routes from this host.
			</p>
		</div>
		<Button variant="outline" size="sm" class="gap-2" onclick={refresh} disabled={loading}>
			{#if loading}<Loader2 class="size-3.5 animate-spin" />{:else}<RefreshCw
					class="size-3.5"
				/>{/if}
			Refresh
		</Button>
	</div>

	{#if error}<div
			class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
		>
			{error}
		</div>{/if}

	<section class="mt-4 overflow-hidden border border-border">
		<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
			Interfaces ({result.interfaces.length})
		</div>
		{#if result.interfaces.length === 0}<p class="p-4 text-xs text-muted-foreground">
				No interfaces reported.
			</p>{:else}
			<div class="overflow-auto">
				<table class="w-full min-w-[520px] text-left text-xs">
					<thead class="border-b border-border text-muted-foreground"
						><tr
							><th class="px-3 py-2">Name</th><th class="px-3 py-2">State</th><th class="px-3 py-2"
								>MAC</th
							></tr
						></thead
					><tbody
						>{#each result.interfaces as item}{@const entry = record(item)}<tr
								class="border-b border-border last:border-0"
								><td class="px-3 py-2 font-mono">{String(entry.name ?? '—')}</td><td
									class="px-3 py-2">{String(entry.operstate ?? '—')}</td
								><td class="px-3 py-2 font-mono">{String(entry.mac ?? '—')}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>
		{/if}
	</section>

	<div class="mt-4 grid gap-4 xl:grid-cols-2">
		<section class="overflow-hidden border border-border">
			<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">DNS</div>
			<pre class="max-h-80 overflow-auto p-3 text-xs whitespace-pre-wrap">{result.resolvConf ??
					'DNS configuration unavailable.'}</pre>
		</section>
		<section class="overflow-hidden border border-border">
			<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">Routes</div>
			<pre class="max-h-80 overflow-auto p-3 text-xs">{json(result.routes)}</pre>
		</section>
	</div>
</section>
