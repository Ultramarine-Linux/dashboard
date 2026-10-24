<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppRecipe } from '$lib/apps/catalog';
	import { Button } from '$lib/components/ui/button';
	import SegmentedControl from '$lib/components/segmented-control.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import {
		listManagedHostApps,
		type HostSummary,
		type ManagedHostAppListItem,
		type ManagedHostQuadletScope
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/lucide/refresh-cw';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let scope = $state<ManagedHostQuadletScope>(
		page.url.searchParams.get('scope') === 'system' ? 'system' : 'user'
	);
	let apps = $state<ManagedHostAppListItem[]>([]);
	let loading = $state(false);
	let actionError = $state('');
	let loadedKey = $state('');

	$effect(() => {
		const key = scope;
		if (loadedKey === key) return;
		loadedKey = key;
		loadApps();
	});

	async function loadApps() {
		const requestKey = scope;
		loading = true;
		actionError = '';
		try {
			const nextApps = await listManagedHostApps({ scope });
			if (requestKey === scope) apps = nextApps;
		} catch (err) {
			if (requestKey === scope) {
				actionError = getErrorMessage(err, 'Failed to load apps.');
			}
		} finally {
			if (requestKey === scope) loading = false;
		}
	}

	function setScope(nextScope: ManagedHostQuadletScope) {
		scope = nextScope;
		goto(`/apps?scope=${nextScope}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function openApp(app: ManagedHostAppListItem) {
		goto(`/apps/${encodeURIComponent(app.name)}?scope=${scope}`);
	}

	const scopeOptions: { value: ManagedHostQuadletScope; label: string }[] = [
		{ value: 'user', label: 'User' },
		{ value: 'system', label: 'System' }
	];
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Apps</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Cook recipes into installed apps and manage their lifecycle.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<SegmentedControl label="Scope" options={scopeOptions} value={scope} onchange={setScope} />
			<Button variant="outline" size="sm" class="gap-2" onclick={loadApps} disabled={loading}>
				{#if loading}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<RefreshCw class="size-3.5" />
				{/if}
				Refresh
			</Button>
			<Button size="sm" class="gap-2" onclick={() => goto(`/apps/create?scope=${scope}`)}>
				<Plus class="size-3.5" />
				New app
			</Button>
		</div>
	</div>

	{#if actionError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{actionError}
		</div>
	{/if}

	<div class="mt-5 overflow-hidden border border-border">
		{#if loading && apps.length === 0}
			<div class="flex items-center gap-2 p-4 text-xs text-muted-foreground">
				<Loader2 class="size-3.5 animate-spin" />
				Loading apps
			</div>
		{:else if apps.length === 0}
			<div class="p-4 text-xs text-muted-foreground">
				<p>No apps installed for this scope yet.</p>
				<p class="mt-1">Use New app to cook one from a recipe.</p>
			</div>
		{:else}
			<div class="divide-y divide-border">
				{#each apps as app (app.name)}
					<button
						type="button"
						class="block w-full p-3 text-left transition-colors duration-100 hover:bg-muted/30"
						onclick={() => openApp(app)}
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex min-w-0 items-center gap-2">
								<span class="truncate font-medium text-foreground">{app.name}</span>
								<StatusBadge status={app.status} />
							</div>
							<span class="shrink-0 text-xs text-muted-foreground">
								Updated {new Date(app.updatedAt * 1000).toLocaleString()}
							</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">
							{getAppRecipe(app.recipeId)?.name ?? app.recipeId} · v{app.recipeVersion}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							{app.services.length === 1 ? '1 service' : `${app.services.length} services`}
							{#if app.services.length > 0}
								— {app.services.map((service) => `${service.name} (${service.sub})`).join(', ')}
							{/if}
						</p>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</section>
