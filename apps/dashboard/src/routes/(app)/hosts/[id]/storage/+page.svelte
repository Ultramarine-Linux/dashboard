<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		getManagedHostStorage,
		type ManagedHost,
		type ManagedHostStorageResult
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';

	type PageData = { host: ManagedHost };
	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let result = $state<ManagedHostStorageResult>({ mounts: [], partitions: [], zfs: null });
	let loading = $state(false);
	let error = $state('');
	let loadedHostId = $state<string | null>(null);

	function record(value: unknown): Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	}

	function value(item: unknown, key: string) {
		const field = record(item)[key];
		return field === undefined || field === null || field === '' ? '—' : String(field);
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
			result = await getManagedHostStorage({ hostId: host.id });
		} catch (err) {
			error = getErrorMessage(err, 'Failed to load storage information.');
		} finally {
			loading = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-sm font-semibold text-foreground">Storage</h1>
			<p class="mt-1 text-xs text-muted-foreground">
				Mounts, partitions, and ZFS discovery from this host.
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

	<div class="mt-4 grid gap-4 xl:grid-cols-2">
		<section class="overflow-hidden border border-border">
			<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
				Mounted filesystems ({result.mounts.length})
			</div>
			{#if result.mounts.length === 0}<p class="p-4 text-xs text-muted-foreground">
					No mount data reported.
				</p>{:else}
				<div class="overflow-auto">
					<table class="w-full min-w-[640px] text-left text-xs">
						<thead class="border-b border-border text-muted-foreground"
							><tr
								><th class="px-3 py-2">Source</th><th class="px-3 py-2">Target</th><th
									class="px-3 py-2">Filesystem</th
								><th class="px-3 py-2">Options</th></tr
							></thead
						><tbody
							>{#each result.mounts as item}<tr class="border-b border-border last:border-0"
									><td class="px-3 py-2 font-mono">{value(item, 'source')}</td><td
										class="px-3 py-2 font-mono">{value(item, 'target')}</td
									><td class="px-3 py-2">{value(item, 'filesystem')}</td><td
										class="max-w-64 truncate px-3 py-2">{value(item, 'options')}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
			{/if}
		</section>

		<section class="overflow-hidden border border-border">
			<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
				Partitions ({result.partitions.length})
			</div>
			{#if result.partitions.length === 0}<p class="p-4 text-xs text-muted-foreground">
					No partition data reported.
				</p>{:else}
				<pre class="max-h-80 overflow-auto p-3 text-xs">{json(result.partitions)}</pre>
			{/if}
		</section>
	</div>

	<section class="mt-4 overflow-hidden border border-border">
		<div class="border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">ZFS</div>
		{#if result.zfs}<pre class="max-h-96 overflow-auto p-3 text-xs">{json(
					result.zfs
				)}</pre>{:else}<p class="p-4 text-xs text-muted-foreground">
				ZFS discovery is unavailable on this agent.
			</p>{/if}
	</section>
</section>
