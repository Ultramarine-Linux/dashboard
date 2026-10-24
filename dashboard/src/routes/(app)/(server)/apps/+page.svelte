<script lang="ts">
	import { formatDateTime, t, tn } from '$lib/i18n';
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
				actionError = getErrorMessage(err, t('apps.loadFailed'));
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

	const scopeOptions = $derived<{ value: ManagedHostQuadletScope; label: string }[]>([
		{ value: 'user', label: t('apps.scopeUser') },
		{ value: 'system', label: t('apps.scopeSystem') }
	]);
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('apps.title')}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{t('apps.subtitle')}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<SegmentedControl
				label={t('apps.scope')}
				options={scopeOptions}
				value={scope}
				onchange={setScope}
			/>
			<Button variant="outline" size="sm" class="gap-2" onclick={loadApps} disabled={loading}>
				{#if loading}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<RefreshCw class="size-3.5" />
				{/if}
				{t('common.refresh')}
			</Button>
			<Button size="sm" class="gap-2" onclick={() => goto(`/apps/create?scope=${scope}`)}>
				<Plus class="size-3.5" />
				{t('apps.newApp')}
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
				{t('apps.loadingApps')}
			</div>
		{:else if apps.length === 0}
			<div class="p-4 text-xs text-muted-foreground">
				<p>{t('apps.emptyTitle')}</p>
				<p class="mt-1">{t('apps.emptyHint')}</p>
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
								{t('apps.updatedAt', { date: formatDateTime(app.updatedAt * 1000) })}
							</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">
							{getAppRecipe(app.recipeId)?.name ?? app.recipeId} · v{app.recipeVersion}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							{tn('apps.services', app.services.length)}
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
