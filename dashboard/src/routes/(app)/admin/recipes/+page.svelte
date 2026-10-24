<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { formatDateTime, t, tn } from '$lib/i18n';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { confirmDestructive } from '$lib/confirm.svelte';
	import {
		addRecipeCatalog,
		refreshRecipeCatalogs,
		removeRecipeCatalog
	} from '$lib/remote/recipe-catalogs.remote';
	import type { RecipeCatalogSummary } from '$lib/apps/catalog';
	import { getErrorMessage } from '$lib/utils';
	import AlertTriangle from '~icons/nucleo/alert-triangle';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/nucleo/refresh-cw';
	import Trash from '~icons/lucide/trash';

	let { data }: { data: { catalogs: RecipeCatalogSummary[] } } = $props();

	let adding = $state(false);
	let saving = $state(false);
	let url = $state('');
	let name = $state('');
	let pageError = $state('');
	/** Catalog ids being refreshed, or `*` for all of them. */
	let refreshing = $state<Record<string, boolean>>({});
	let removing = $state<Record<string, boolean>>({});

	function startAdd() {
		adding = true;
		url = '';
		name = '';
		pageError = '';
	}

	async function addCatalog() {
		if (saving || !url.trim()) return;
		saving = true;
		pageError = '';
		try {
			const { result } = await addRecipeCatalog({
				url: url.trim(),
				...(name.trim() ? { name: name.trim() } : {})
			});
			await invalidate('app:recipes');
			adding = false;
			if (result.status === 'failed') {
				toast.warning(t('admin.recipes.toastAddedWithError'));
			} else {
				toast.success(t('admin.recipes.toastAdded'));
			}
		} catch (err) {
			pageError = getErrorMessage(err, t('admin.recipes.errorAdd'));
		} finally {
			saving = false;
		}
	}

	async function refresh(id?: string) {
		const key = id ?? '*';
		if (refreshing[key]) return;
		refreshing = { ...refreshing, [key]: true };
		pageError = '';
		try {
			await refreshRecipeCatalogs(id ? { id } : {});
			await invalidate('app:recipes');
		} catch (err) {
			pageError = getErrorMessage(err, t('admin.recipes.errorRefresh'));
		} finally {
			refreshing = { ...refreshing, [key]: false };
		}
	}

	async function remove(catalog: RecipeCatalogSummary) {
		const ok = await confirmDestructive({
			title: t('admin.recipes.removeTitle'),
			description: t('admin.recipes.removeDescription', { name: catalog.name }),
			confirmLabel: t('admin.recipes.remove')
		});
		if (!ok) return;
		removing = { ...removing, [catalog.id]: true };
		pageError = '';
		try {
			await removeRecipeCatalog({ id: catalog.id });
			await invalidate('app:recipes');
			toast.success(t('admin.recipes.toastRemoved'));
		} catch (err) {
			pageError = getErrorMessage(err, t('admin.recipes.errorRemove'));
		} finally {
			removing = { ...removing, [catalog.id]: false };
		}
	}
</script>

<div class="flex-1 overflow-auto">
	<div class="flex flex-col gap-5 p-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="text-xl font-semibold tracking-tight text-foreground">
					{t('admin.recipes.title')}
				</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">{t('admin.recipes.subtitle')}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					class="gap-1.5"
					onclick={() => refresh()}
					disabled={refreshing['*']}
				>
					{#if refreshing['*']}
						<Loader2 class="size-3.5 animate-spin" />
					{:else}
						<RefreshCw class="size-3.5" />
					{/if}
					{t('admin.recipes.refreshAll')}
				</Button>
				<Button size="sm" class="gap-1.5" onclick={startAdd} disabled={adding}>
					<Plus class="size-3.5" />
					{t('admin.recipes.addCatalog')}
				</Button>
			</div>
		</div>

		{#if pageError}
			<div
				role="alert"
				class="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
			>
				<AlertTriangle class="size-4 shrink-0" />{pageError}
			</div>
		{/if}

		{#if adding}
			<div class="border border-border/60 bg-background/30 p-4">
				<div class="mb-4">
					<h2 class="text-sm font-semibold text-foreground">{t('admin.recipes.addTitle')}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{t('admin.recipes.addHint')}</p>
				</div>
				<form
					class="grid gap-4 lg:grid-cols-2"
					onsubmit={(event) => {
						event.preventDefault();
						addCatalog();
					}}
				>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						{t('admin.recipes.fieldUrl')}
						<Input
							type="url"
							bind:value={url}
							placeholder="https://example.com/recipes/v1"
							required
						/>
					</label>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						{t('admin.recipes.fieldName')}
						<Input bind:value={name} placeholder={t('admin.recipes.namePlaceholder')} />
					</label>
					<div class="flex gap-2 lg:col-span-2">
						<Button type="submit" size="sm" class="gap-1.5" disabled={saving || !url.trim()}>
							{#if saving}
								<Loader2 class="size-3.5 animate-spin" />
							{/if}
							{t('admin.recipes.add')}
						</Button>
						<Button type="button" variant="ghost" size="sm" onclick={() => (adding = false)}>
							{t('common.cancel')}
						</Button>
					</div>
				</form>
			</div>
		{/if}

		<div class="divide-y divide-border/50 border border-border/60 bg-background/30">
			{#each data.catalogs as catalog (catalog.id)}
				<div class="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-medium text-foreground">{catalog.name}</h2>
							<Badge variant={catalog.kind === 'builtin' ? 'secondary' : 'outline'}>
								{catalog.kind === 'builtin'
									? t('admin.recipes.kindBuiltin')
									: t('admin.recipes.kindCustom')}
							</Badge>
						</div>
						<p class="font-mono text-xs break-all text-muted-foreground">{catalog.url}</p>
						<p class="text-xs text-muted-foreground">
							{tn('admin.recipes.recipes', catalog.recipeCount)}
							·
							{catalog.fetchedAt
								? t('admin.recipes.lastRefreshed', { date: formatDateTime(catalog.fetchedAt) })
								: t('admin.recipes.neverRefreshed')}
						</p>
						{#if catalog.lastError}
							<p class="text-xs text-destructive">
								{catalog.available
									? t('admin.recipes.refreshFailedStale')
									: t('admin.recipes.refreshFailedEmpty')}
								{#if catalog.lastErrorAt}
									({formatDateTime(catalog.lastErrorAt)})
								{/if}
							</p>
							<p class="font-mono text-xs break-all text-destructive/80">{catalog.lastError}</p>
						{/if}
					</div>
					<div class="flex shrink-0 gap-2">
						<Button
							variant="outline"
							size="sm"
							class="gap-1.5"
							onclick={() => refresh(catalog.id)}
							disabled={refreshing[catalog.id] || refreshing['*']}
							aria-label={t('admin.recipes.refreshLabel', { name: catalog.name })}
						>
							{#if refreshing[catalog.id] || catalog.refreshing}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<RefreshCw class="size-3.5" />
							{/if}
							{t('common.refresh')}
						</Button>
						{#if catalog.kind === 'custom'}
							<Button
								variant="outline"
								size="sm"
								class="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
								onclick={() => remove(catalog)}
								disabled={removing[catalog.id]}
								aria-label={t('admin.recipes.removeLabel', { name: catalog.name })}
							>
								<Trash class="size-3.5" />
								{t('admin.recipes.remove')}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
