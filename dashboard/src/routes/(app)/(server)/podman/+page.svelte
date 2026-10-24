<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { confirmDestructive } from '$lib/confirm.svelte';
	import {
		listManagedHostPodman,
		runManagedHostPodmanContainerAction,
		type HostSummary
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import SegmentedControl from '$lib/components/segmented-control.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import FileText from '~icons/lucide/file-text';
	import Loader2 from '~icons/lucide/loader-2';
	import Play from '~icons/lucide/play';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import RotateCw from '~icons/lucide/rotate-cw';
	import Square from '~icons/lucide/square';
	import Trash2 from '~icons/lucide/trash-2';

	type PodmanResource = 'containers' | 'images' | 'volumes' | 'networks';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let podmanResource = $state<PodmanResource>('containers');
	let podmanData = $state<unknown[]>([]);
	let podmanCommand = $state<string | null>(null);
	let podmanLoading = $state(false);
	let podmanError = $state('');
	let podmanActionName = $state('');

	const podmanResources: { id: PodmanResource; label: string }[] = [
		{ id: 'containers', label: 'Containers' },
		{ id: 'images', label: 'Images' },
		{ id: 'volumes', label: 'Volumes' },
		{ id: 'networks', label: 'Networks' }
	];

	function asRecord(value: unknown): Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	}

	function field(record: Record<string, unknown>, keys: string[]) {
		for (const key of keys) {
			const value = record[key];
			if (Array.isArray(value)) return value.join(', ');
			if (value !== undefined && value !== null && String(value).trim()) return String(value);
		}
		return 'Unknown';
	}

	function podmanRowKey(item: unknown, index: number) {
		const record = asRecord(item);
		return field(record, ['Id', 'ID', 'Name', 'Names']) + `-${index}`;
	}

	function containerName(item: unknown) {
		return field(asRecord(item), ['Names', 'Name', 'Id', 'ID']);
	}

	$effect(() => {
		untrack(() => refreshPodman());
	});

	async function refreshPodman(resource: PodmanResource = podmanResource) {
		if (podmanLoading) return;
		podmanError = '';
		podmanLoading = true;
		try {
			const result = await listManagedHostPodman({ resource });
			podmanResource = resource;
			podmanData = result.data;
			podmanCommand = result.command;
		} catch (err) {
			podmanError = getErrorMessage(err, 'Failed to load Podman resources.');
		} finally {
			podmanLoading = false;
		}
	}

	async function runContainerAction(action: 'start' | 'stop' | 'restart' | 'remove', name: string) {
		if (podmanActionName) return;
		if (action === 'remove') {
			const ok = await confirmDestructive({
				title: 'Remove container',
				description: `This will remove ${name} from ${host.hostname ?? 'this server'}.`,
				confirmWord: name,
				confirmLabel: 'Remove container'
			});
			if (!ok) return;
		}

		podmanActionName = `${action}:${name}`;
		podmanError = '';
		try {
			await runManagedHostPodmanContainerAction({ name, action });
			await refreshPodman('containers');
		} catch (err) {
			podmanError = getErrorMessage(err, 'Podman action failed.');
		} finally {
			podmanActionName = '';
		}
	}

	function containerPath(name: string, section?: 'logs') {
		const path = `/podman/${encodeURIComponent(name)}`;
		return section ? `${path}#${section}` : path;
	}

	function openContainer(name: string, section?: 'logs') {
		goto(containerPath(name, section));
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Podman</h1>
			<p class="mt-1 text-sm text-muted-foreground">Inspect and manage containers on this host.</p>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="gap-2"
			onclick={() => refreshPodman()}
			disabled={podmanLoading}
		>
			{#if podmanLoading}
				<Loader2 class="size-3.5 animate-spin" />
			{:else}
				<RefreshCw class="size-3.5" />
			{/if}
			Refresh
		</Button>
	</div>

	<SegmentedControl
		class="mt-5"
		label="Podman resource"
		options={podmanResources.map((resource) => ({ value: resource.id, label: resource.label }))}
		value={podmanResource}
		onchange={(resource) => refreshPodman(resource)}
		disabled={podmanLoading}
	/>

	{#if podmanError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{podmanError}
		</div>
	{/if}

	<div class="mt-4 overflow-hidden border border-border">
		{#if podmanLoading && podmanData.length === 0}
			<div class="flex items-center gap-2 p-4 text-xs text-muted-foreground">
				<Loader2 class="size-3.5 animate-spin" />
				Loading Podman {podmanResource}
			</div>
		{:else if podmanData.length === 0}
			<div class="p-4 text-xs text-muted-foreground">No Podman {podmanResource} found.</div>
		{:else}
			<div class="overflow-auto">
				<table class="w-full min-w-[720px] text-left text-xs">
					<thead class="border-b border-border bg-muted/30 text-muted-foreground">
						<tr>
							{#if podmanResource === 'containers'}
								<th class="px-3 py-2 font-medium">Name</th>
								<th class="px-3 py-2 font-medium">Image</th>
								<th class="px-3 py-2 font-medium">State</th>
								<th class="px-3 py-2 font-medium">Status</th>
								<th class="px-3 py-2 text-right font-medium">Actions</th>
							{:else if podmanResource === 'images'}
								<th class="px-3 py-2 font-medium">Repository</th>
								<th class="px-3 py-2 font-medium">Tag</th>
								<th class="px-3 py-2 font-medium">Image ID</th>
								<th class="px-3 py-2 font-medium">Size</th>
							{:else if podmanResource === 'volumes'}
								<th class="px-3 py-2 font-medium">Name</th>
								<th class="px-3 py-2 font-medium">Driver</th>
								<th class="px-3 py-2 font-medium">Mountpoint</th>
							{:else}
								<th class="px-3 py-2 font-medium">Name</th>
								<th class="px-3 py-2 font-medium">Driver</th>
								<th class="px-3 py-2 font-medium">Interface</th>
							{/if}
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each podmanData as item, index (podmanRowKey(item, index))}
							{@const record = asRecord(item)}
							<tr class="transition-colors hover:bg-muted/30">
								{#if podmanResource === 'containers'}
									{@const name = containerName(item)}
									{@const containerState = field(record, ['State'])}
									{@const running = containerState.toLowerCase() === 'running'}
									<td class="max-w-56 px-3 py-2 font-medium text-foreground">
										<a
											href={containerPath(name)}
											class="block truncate underline-offset-4 hover:text-primary hover:underline"
										>
											{name}
										</a>
									</td>
									<td class="max-w-64 px-3 py-2 text-muted-foreground">
										<span class="block truncate font-mono text-[11px]"
											>{field(record, ['Image'])}</span
										>
									</td>
									<td class="px-3 py-2"><StatusBadge status={containerState} /></td>
									<td class="max-w-56 px-3 py-2 text-muted-foreground">
										<span class="block truncate">{field(record, ['Status'])}</span>
									</td>
									<td class="px-3 py-2">
										<div class="flex items-center justify-end gap-1">
											{#if running}
												<Button
													variant="outline"
													size="sm"
													class="h-7 w-[4.5rem] gap-1.5 px-2 text-xs"
													onclick={() => runContainerAction('stop', name)}
													disabled={!!podmanActionName}
												>
													{#if podmanActionName === `stop:${name}`}
														<Loader2 class="size-3 animate-spin" />
													{:else}
														<Square class="size-3" />
													{/if}
													Stop
												</Button>
											{:else}
												<Button
													variant="outline"
													size="sm"
													class="h-7 w-[4.5rem] gap-1.5 px-2 text-xs"
													onclick={() => runContainerAction('start', name)}
													disabled={!!podmanActionName}
												>
													{#if podmanActionName === `start:${name}`}
														<Loader2 class="size-3 animate-spin" />
													{:else}
														<Play class="size-3" />
													{/if}
													Start
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="icon-sm"
												title="Restart"
												aria-label="Restart {name}"
												onclick={() => runContainerAction('restart', name)}
												disabled={!!podmanActionName}
											>
												<RotateCw
													class="size-3.5 {podmanActionName === `restart:${name}`
														? 'animate-spin'
														: ''}"
												/>
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title="Logs"
												aria-label="Logs for {name}"
												onclick={() => openContainer(name, 'logs')}
											>
												<FileText class="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												class="text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-300"
												title="Remove"
												aria-label="Remove {name}"
												onclick={() => runContainerAction('remove', name)}
												disabled={!!podmanActionName}
											>
												<Trash2 class="size-3.5" />
											</Button>
										</div>
									</td>
								{:else if podmanResource === 'images'}
									<td class="max-w-72 px-3 py-2 font-medium text-foreground">
										<span class="block truncate">{field(record, ['Repository'])}</span>
									</td>
									<td class="px-3 py-2 text-muted-foreground">{field(record, ['Tag'])}</td>
									<td class="max-w-56 px-3 py-2 font-mono text-muted-foreground">
										<span class="block truncate">{field(record, ['Id', 'ID', 'ImageID'])}</span>
									</td>
									<td class="px-3 py-2 text-muted-foreground">{field(record, ['Size'])}</td>
								{:else if podmanResource === 'volumes'}
									<td class="px-3 py-2 font-medium text-foreground">{field(record, ['Name'])}</td>
									<td class="px-3 py-2 text-muted-foreground">{field(record, ['Driver'])}</td>
									<td class="max-w-96 px-3 py-2 text-muted-foreground">
										<span class="block truncate">{field(record, ['Mountpoint'])}</span>
									</td>
								{:else}
									<td class="px-3 py-2 font-medium text-foreground">{field(record, ['Name'])}</td>
									<td class="px-3 py-2 text-muted-foreground">{field(record, ['Driver'])}</td>
									<td class="px-3 py-2 text-muted-foreground">
										{field(record, ['NetworkInterface', 'Interface'])}
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>
