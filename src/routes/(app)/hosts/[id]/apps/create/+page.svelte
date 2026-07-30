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
	let appName = $state('');
	let appIdTouched = $state(false);
	let values = $state<AppValueMap>({});
	let saving = $state(false);
	let actionError = $state('');
	let result = $state<ManagedHostAppWriteResult | null>(null);

	const recipe = $derived(selectedRecipeId ? getAppRecipe(selectedRecipeId) : null);
	const errors = $derived(recipe ? validateRecipeValues(recipe, values) : []);
	const nameValid = $derived(isValidAppName(appName));
	const hostModules = $derived(
		new Set(parseHostCapabilities(host.capabilities).modules.map((module) => module.name))
	);
	const missingRequirements = $derived(
		recipe ? recipe.requires.filter((module) => !hostModules.has(module)) : []
	);

	function selectRecipe(next: AppRecipe) {
		selectedRecipeId = next.id;
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
	<div>
		<h1 class="text-sm font-semibold text-foreground">New App</h1>
		<p class="mt-1 text-xs text-muted-foreground">
			Cook a recipe into an installed app on this host.
		</p>
	</div>

	<div class="mt-5">
		<h2 class="text-sm font-semibold text-foreground">Recipe</h2>
		<div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each appRecipes as option (option.id)}
				<Button
					variant={selectedRecipeId === option.id ? 'default' : 'outline'}
					class="h-auto min-w-0 justify-start p-3 text-left whitespace-normal"
					onclick={() => selectRecipe(option)}
				>
					<span class="min-w-0">
						<span class="block text-xs font-semibold">{option.name}</span>
						<span class="mt-1 block text-xs leading-snug break-words">{option.description}</span>
						<span class="mt-1 block text-[11px] opacity-80">
							{option.category} · v{option.version}
						</span>
					</span>
				</Button>
			{/each}
		</div>
	</div>

	{#if recipe}
		<div class="mt-5">
			<div class="mx-auto max-w-5xl space-y-5">
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

					{#if saving}
						<p class="text-xs text-muted-foreground">
							Cooking on the host — rendering templates, installing units, starting services. This
							can take a minute.
						</p>
					{/if}
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

				{#if actionError}
					<div class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
						{actionError}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
