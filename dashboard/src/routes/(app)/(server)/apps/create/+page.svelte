<script lang="ts">
	import { formatNumber, t, tn } from '#lib/i18n/index.js';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { recipeKey, type AppRecipe, type RecipeCatalogKind } from '#lib/apps/catalog.js';
	import {
		defaultRecipeValues,
		isValidAppName,
		normalizeAppId,
		validateRecipeValues,
		valuesForSubmit,
		type AppValueMap
	} from '#lib/apps/params.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Icon from '#lib/components/icon.svelte';
	import {
		createManagedHostApp,
		type HostSummary,
		type ManagedHostAppWriteResult,
		type ManagedHostQuadletScope
	} from '#lib/remote/managed-hosts.remote.js';
	import { refreshRecipeCatalogs } from '#lib/remote/recipe-catalogs.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import { parseHostCapabilities } from '#lib/hosts/capabilities.js';
	import AppCookResult from '#lib/hosts/apps/AppCookResult.svelte';
	import AppValuesForm from '#lib/hosts/apps/AppValuesForm.svelte';

	type PageData = {
		host: HostSummary;
		isAdmin?: boolean;
		recipes: AppRecipe[];
		catalogs: {
			id: string;
			name: string;
			kind: RecipeCatalogKind;
			available: boolean;
			failed: boolean;
			lastError: string | null;
		}[];
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	const scope = $derived<ManagedHostQuadletScope>(
		page.url.searchParams.get('scope') === 'system' ? 'system' : 'user'
	);
	let selectedKey = $state<string | null>(null);
	let recipeSearch = $state('');
	let appName = $state('');
	let appIdTouched = $state(false);
	let values = $state<AppValueMap>({});
	let saving = $state(false);
	let actionError = $state('');
	let result = $state<ManagedHostAppWriteResult | null>(null);

	let refreshing = $state(false);
	let refreshError = $state('');

	const recipe = $derived(
		selectedKey ? (data.recipes.find((option) => recipeKey(option) === selectedKey) ?? null) : null
	);
	const filteredRecipes = $derived(
		data.recipes.filter((option) => {
			const query = recipeSearch.trim().toLowerCase();
			return (
				!query ||
				option.name.toLowerCase().includes(query) ||
				option.description.toLowerCase().includes(query) ||
				option.categoryName.toLowerCase().includes(query)
			);
		})
	);
	// One section per catalog, in the server's order (Fyra Labs first).
	const recipeGroups = $derived(
		data.catalogs
			.map((catalog) => ({
				catalog,
				recipes: filteredRecipes.filter((option) => option.catalogId === catalog.id)
			}))
			.filter((group) => group.recipes.length > 0)
	);
	const unreachableCatalogs = $derived(
		data.catalogs.filter((catalog) => catalog.failed && !catalog.available)
	);
	const staleCatalogs = $derived(
		data.isAdmin ? data.catalogs.filter((catalog) => catalog.failed && catalog.available) : []
	);
	const errors = $derived(recipe ? validateRecipeValues(recipe, values) : []);
	const nameValid = $derived(isValidAppName(appName));
	const hostModules = $derived(
		new Set(parseHostCapabilities(host.capabilities).modules.map((module) => module.name))
	);
	const missingRequirements = $derived(
		recipe ? recipe.requires.filter((module) => !hostModules.has(module)) : []
	);

	const recipeAccentColors: Record<string, string> = {
		'nginx-site': '#51a2da',
		nextcloud: '#0082c9'
	};

	function recipeAccentColor(id: string) {
		return recipeAccentColors[id] ?? '#9ca3af';
	}

	function tierLabel(option: AppRecipe) {
		if (option.tier === 'official') return t('apps.tierOfficial');
		if (option.tier === 'community') return t('apps.tierCommunity');
		return option.catalogName;
	}

	async function refreshCatalogs() {
		if (refreshing) return;
		refreshing = true;
		refreshError = '';
		try {
			await refreshRecipeCatalogs({});
			await invalidate('app:recipes');
		} catch (err) {
			refreshError = getErrorMessage(err, t('apps.refreshCatalogsFailed'));
		} finally {
			refreshing = false;
		}
	}

	function selectRecipe(next: AppRecipe) {
		const key = recipeKey(next);
		selectedKey = selectedKey === key ? null : key;
		if (selectedKey === null) return;
		appName = normalizeAppId(next.id);
		appIdTouched = false;
		values = defaultRecipeValues(next);
		if (next.parameters.some((parameter) => parameter.key === 'app_id')) {
			values = { ...values, app_id: appName };
		}
		result = null;
		actionError = '';
	}

	function updateAppName(name: string) {
		appName = name;
		if (!appIdTouched && recipe?.parameters.some((parameter) => parameter.key === 'app_id')) {
			values = { ...values, app_id: name };
		}
	}

	function handleParamEdit(key: string) {
		if (key === 'app_id') appIdTouched = true;
	}

	function resetCook() {
		selectedKey = null;
		result = null;
		actionError = '';
	}

	async function cook() {
		if (saving || !recipe || errors.length > 0 || !nameValid) return;
		saving = true;
		actionError = '';
		try {
			result = await createManagedHostApp({
				scope,
				name: appName,
				catalogId: recipe.catalogId,
				recipeId: recipe.id,
				valuesJson: JSON.stringify(valuesForSubmit(recipe, values))
			});
		} catch (err) {
			actionError = getErrorMessage(err, t('apps.createFailed'));
		} finally {
			saving = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="mx-auto max-w-6xl">
		<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('apps.newAppTitle')}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{t('apps.createSubtitle')}
		</p>

		<section class="mt-5 border border-border p-4">
			<div class="flex items-center justify-between gap-3 border-b border-border pb-2">
				<div>
					<h2 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						{t('apps.recipeCatalog')}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{t('apps.chooseRecipe')}
					</p>
				</div>
				<span class="text-[11px] text-muted-foreground"
					>{t('apps.recipesAvailable', { count: formatNumber(filteredRecipes.length) })}</span
				>
			</div>
			<div class="mt-3">
				<Input
					bind:value={recipeSearch}
					placeholder={t('apps.searchRecipes')}
					aria-label={t('apps.searchRecipesLabel')}
				/>
			</div>
			{#if unreachableCatalogs.length > 0 || staleCatalogs.length > 0 || refreshError}
				<div class="mt-3 space-y-2" role="status">
					{#each unreachableCatalogs as catalog (catalog.id)}
						<div
							class="border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
						>
							<p>{t('apps.catalogUnreachable', { name: catalog.name })}</p>
							{#if catalog.lastError}
								<p class="mt-1 font-mono break-all opacity-80">{catalog.lastError}</p>
							{/if}
						</div>
					{/each}
					{#each staleCatalogs as catalog (catalog.id)}
						<p class="text-xs text-muted-foreground">
							{t('apps.catalogStale', { name: catalog.name })}
						</p>
					{/each}
					{#if refreshError}
						<p class="text-xs text-destructive">{refreshError}</p>
					{/if}
					{#if data.isAdmin}
						<div class="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								class="gap-2"
								onclick={refreshCatalogs}
								disabled={refreshing}
							>
								{#if refreshing}
									<Loader2 class="size-3.5 animate-spin" />
								{:else}
									<RefreshCw class="size-3.5" />
								{/if}
								{t('apps.refreshCatalogs')}
							</Button>
							<a
								href="/admin/recipes"
								class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							>
								{t('apps.manageCatalogs')}
							</a>
						</div>
					{/if}
				</div>
			{/if}
			{#if recipeGroups.length > 0}
				{#each recipeGroups as group (group.catalog.id)}
					{#if data.catalogs.length > 1}
						<h3
							class="mt-4 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
						>
							{group.catalog.name}
							{#if group.catalog.kind === 'custom'}
								<Badge variant="outline" class="text-[10px] normal-case">
									{t('apps.customCatalog')}
								</Badge>
							{/if}
						</h3>
					{/if}
					<div class="mt-3 grid gap-px bg-border md:grid-cols-2">
						{#each group.recipes as option (recipeKey(option))}
							<button
								type="button"
								class="relative flex min-w-0 gap-3 overflow-hidden bg-background p-4 text-left transition-colors hover:bg-muted/30 {selectedKey ===
								recipeKey(option)
									? 'ring-2 ring-primary ring-inset'
									: ''}"
								aria-pressed={selectedKey === recipeKey(option)}
								onclick={() => selectRecipe(option)}
							>
								<div
									class="pointer-events-none absolute inset-0 opacity-[0.05]"
									style={`background: linear-gradient(135deg, ${recipeAccentColor(option.id)} 0%, transparent 60%)`}
								></div>
								<div
									class="relative flex size-10 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-primary"
								>
									<Icon name={option.icon ?? option.id} class="size-6" title={option.name} />
								</div>
								<div class="relative min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="truncate text-sm font-semibold text-foreground">{option.name}</span
										>
										<span class="shrink-0 text-[10px] text-muted-foreground">v{option.version}</span
										>
									</div>
									<p class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
										{option.description}
									</p>
									<div class="mt-2 flex flex-wrap items-center gap-2">
										<span
											class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
										>
											{option.categoryName}
										</span>
										<Badge
											variant={option.tier === 'official' ? 'secondary' : 'outline'}
											class="max-w-40 truncate text-[10px]"
										>
											{tierLabel(option)}
										</Badge>
									</div>
								</div>
							</button>
						{/each}
					</div>
				{/each}
			{:else if data.recipes.length === 0}
				<div class="py-8 text-center text-xs text-muted-foreground">
					{t('apps.noRecipes')}
				</div>
			{:else}
				<div class="py-8 text-center text-xs text-muted-foreground">
					{t('apps.noRecipesMatch', { query: recipeSearch })}
				</div>
			{/if}
		</section>

		<div class="mt-4 min-h-12" aria-live="polite">
			{#if actionError}
				<div
					role="alert"
					class="flex items-start gap-2 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
				>
					<span class="mt-0.5 size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
					<span>{actionError}</span>
				</div>
			{/if}
		</div>

		{#if recipe}
			<div class="mt-5 space-y-5">
				<section class="space-y-5 border border-border p-5">
					<div>
						<h2 class="text-sm font-semibold text-foreground">{t('apps.appSettings')}</h2>
						<p class="mt-1 text-xs text-muted-foreground">{recipe.name}</p>
					</div>

					{#if missingRequirements.length > 0}
						<p class="text-xs text-amber-600 dark:text-amber-400">
							{tn('apps.missingModules', missingRequirements.length, {
								modules: missingRequirements.join(', ')
							})}
						</p>
					{/if}

					<div class="space-y-2">
						<Label for="app-name">{t('apps.appName')}</Label>
						<Input
							id="app-name"
							value={appName}
							oninput={(event) => updateAppName(event.currentTarget.value)}
						/>
						{#if appName && !nameValid}
							<p class="text-xs text-destructive">
								{t('apps.invalidName')}
							</p>
						{/if}
					</div>

					<AppValuesForm {recipe} bind:values onparamedit={handleParamEdit} />

					{#if errors.length > 0}
						<div class="space-y-1">
							{#each errors as formError (formError)}
								<p class="text-xs text-destructive">{formError}</p>
							{/each}
						</div>
					{/if}

					<Button
						class="w-full gap-2"
						onclick={cook}
						disabled={saving || errors.length > 0 || !nameValid}
					>
						{#if saving}
							<Loader2 class="size-3.5 animate-spin" />
						{/if}
						{t('apps.cookApp')}
					</Button>
				</section>

				{#if result}
					{@const cooked = result}
					<AppCookResult title={t('apps.cooked')} result={cooked}>
						{#snippet actions()}
							<Button
								size="sm"
								onclick={() =>
									goto(`/apps/${encodeURIComponent(cooked.manifest.name)}?scope=${scope}`)}
							>
								{t('apps.openApp')}
							</Button>
							<Button variant="outline" size="sm" onclick={resetCook}
								>{t('apps.cookAnother')}</Button
							>
						{/snippet}
					</AppCookResult>
				{/if}
			</div>
		{/if}
	</div>
</section>
