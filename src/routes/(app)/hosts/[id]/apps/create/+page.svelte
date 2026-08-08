<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { appRecipes, getAppRecipe, type AppRecipe } from '$lib/apps/catalog';
	import {
		defaultRecipeValues,
		isValidAppName,
		normalizeAppId,
		validateRecipeValues,
		valuesForSubmit,
		type AppValueMap
	} from '$lib/apps/params';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Icon from '$lib/components/icon.svelte';
	import {
		createManagedHostApp,
		type ManagedHost,
		type ManagedHostAppWriteResult,
		type ManagedHostQuadletScope
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import { parseHostCapabilities } from '../../lib/capabilities';
	import AppCookResult from '../lib/AppCookResult.svelte';
	import AppValuesForm from '../lib/AppValuesForm.svelte';

	type PageData = {
		host: ManagedHost;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	const scope = $derived<ManagedHostQuadletScope>(
		page.url.searchParams.get('scope') === 'system' ? 'system' : 'user'
	);
	let selectedRecipeId = $state<string | null>(null);
	let recipeSearch = $state('');
	let appName = $state('');
	let appIdTouched = $state(false);
	let values = $state<AppValueMap>({});
	let saving = $state(false);
	let actionError = $state('');
	let result = $state<ManagedHostAppWriteResult | null>(null);

	const recipe = $derived(selectedRecipeId ? getAppRecipe(selectedRecipeId) : null);
	const filteredRecipes = $derived(
		appRecipes.filter((option) => {
			const query = recipeSearch.trim().toLowerCase();
			return (
				!query ||
				option.name.toLowerCase().includes(query) ||
				option.description.toLowerCase().includes(query) ||
				option.category.toLowerCase().includes(query)
			);
		})
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

	function selectRecipe(next: AppRecipe) {
		selectedRecipeId = selectedRecipeId === next.id ? null : next.id;
		if (selectedRecipeId === null) return;
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
		selectedRecipeId = null;
		result = null;
		actionError = '';
	}

	async function cook() {
		if (saving || !recipe || errors.length > 0 || !nameValid) return;
		saving = true;
		actionError = '';
		try {
			result = await createManagedHostApp({
				hostId: host.id,
				scope,
				name: appName,
				recipeId: recipe.id,
				valuesJson: JSON.stringify(valuesForSubmit(recipe, values))
			});
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to cook app.');
		} finally {
			saving = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div class="mx-auto max-w-6xl">
		<h1 class="text-sm font-semibold text-foreground">New App</h1>
		<p class="mt-1 text-xs text-muted-foreground">
			Cook a recipe into an installed app on this host.
		</p>

		<section class="mt-5 border border-border p-4">
			<div class="flex items-center justify-between gap-3 border-b border-border pb-2">
				<div>
					<h2 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						Recipe catalog
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Choose an app recipe to install on this host.
					</p>
				</div>
				<span class="text-[11px] text-muted-foreground">{filteredRecipes.length} available</span>
			</div>
			<div class="mt-3">
				<Input
					bind:value={recipeSearch}
					placeholder="Search recipes..."
					aria-label="Search recipes"
				/>
			</div>
			{#if filteredRecipes.length > 0}
				<div class="mt-3 grid gap-px bg-border md:grid-cols-2">
					{#each filteredRecipes as option (option.id)}
						<button
							type="button"
							class="relative flex min-w-0 gap-3 overflow-hidden bg-background p-4 text-left transition-colors hover:bg-muted/30 {selectedRecipeId ===
							option.id
								? 'ring-2 ring-primary ring-inset'
								: ''}"
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
									<span class="truncate text-sm font-semibold text-foreground">{option.name}</span>
									<span class="shrink-0 text-[10px] text-muted-foreground">v{option.version}</span>
								</div>
								<p class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
									{option.description}
								</p>
								<p
									class="mt-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
								>
									{option.category}
								</p>
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<div class="py-8 text-center text-xs text-muted-foreground">
					No recipes match “{recipeSearch}”.
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
						<h2 class="text-sm font-semibold text-foreground">App Settings</h2>
						<p class="mt-1 text-xs text-muted-foreground">{recipe.name}</p>
					</div>

					{#if missingRequirements.length > 0}
						{@const plural = missingRequirements.length > 1 ? 's' : ''}
						<p class="text-xs text-amber-600 dark:text-amber-400">
							This host does not advertise the {missingRequirements.join(', ')} module{plural};
							cooking may fail.
						</p>
					{/if}

					<div class="space-y-2">
						<Label for="app-name">App name</Label>
						<Input
							id="app-name"
							value={appName}
							oninput={(event) => updateAppName(event.currentTarget.value)}
						/>
						{#if appName && !nameValid}
							<p class="text-xs text-destructive">
								Use letters, digits, dots, underscores, and dashes; start with a letter or digit.
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
						Cook app
					</Button>
				</section>

				{#if result}
					{@const cooked = result}
					<AppCookResult title="App cooked" result={cooked}>
						{#snippet actions()}
							<Button
								size="sm"
								onclick={() =>
									goto(
										`/hosts/${host.id}/apps/${encodeURIComponent(cooked.manifest.name)}?scope=${scope}`
									)}
							>
								Open app
							</Button>
							<Button variant="outline" size="sm" onclick={resetCook}>Cook another</Button>
						{/snippet}
					</AppCookResult>
				{/if}
			</div>
		{/if}
	</div>
</section>
