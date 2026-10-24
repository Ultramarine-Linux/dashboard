<script lang="ts">
	import type { AppRecipe, AppRecipeParameter } from '$lib/apps/catalog';
	import type { AppValueMap } from '$lib/apps/params';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	let {
		recipe,
		values = $bindable(),
		idPrefix = 'param',
		onparamedit
	}: {
		recipe: AppRecipe;
		values: AppValueMap;
		idPrefix?: string;
		onparamedit?: (key: string) => void;
	} = $props();

	function textValue(parameter: AppRecipeParameter): string | number {
		const value = values[parameter.key];
		return typeof value === 'string' || typeof value === 'number' ? value : '';
	}

	function updateValue(key: string, value: string | number | boolean) {
		onparamedit?.(key);
		values = { ...values, [key]: value };
	}
</script>

{#each recipe.parameters as parameter (parameter.key)}
	{@const id = `${idPrefix}-${parameter.key}`}
	{#if parameter.type === 'boolean'}
		<div class="flex items-center justify-between gap-4 border border-border p-3">
			<div class="min-w-0">
				<p class="text-xs font-medium text-foreground">
					{parameter.label}{parameter.required ? ' *' : ''}
				</p>
			</div>
			<Switch
				{id}
				aria-label={parameter.label}
				bind:checked={
					() => values[parameter.key] === true, (checked) => updateValue(parameter.key, checked)
				}
			/>
		</div>
	{:else if parameter.type === 'choice'}
		<div class="space-y-2">
			<Label>{parameter.label}{parameter.required ? ' *' : ''}</Label>
			<div class="flex flex-wrap gap-2">
				{#each parameter.options as option (option)}
					<Button
						type="button"
						size="sm"
						variant={values[parameter.key] === option ? 'default' : 'ghost'}
						onclick={() => updateValue(parameter.key, option)}
					>
						{option}
					</Button>
				{/each}
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			<Label for={id}>{parameter.label}{parameter.required ? ' *' : ''}</Label>
			{#if parameter.type === 'integer'}
				<Input
					{id}
					type="number"
					min={parameter.min ?? undefined}
					max={parameter.max ?? undefined}
					placeholder={parameter.placeholder ?? undefined}
					value={textValue(parameter)}
					oninput={(event) => updateValue(parameter.key, event.currentTarget.value)}
				/>
			{:else if parameter.type === 'secret'}
				<Input
					{id}
					type="password"
					autocomplete="off"
					placeholder={parameter.placeholder ?? undefined}
					value={textValue(parameter)}
					oninput={(event) => updateValue(parameter.key, event.currentTarget.value)}
				/>
				{#if parameter.generate === 'random_32'}
					<p class="text-xs text-muted-foreground">Auto-generated — edit if needed.</p>
				{/if}
			{:else}
				<Input
					{id}
					placeholder={parameter.placeholder ?? undefined}
					value={textValue(parameter)}
					oninput={(event) => updateValue(parameter.key, event.currentTarget.value)}
				/>
			{/if}
		</div>
	{/if}
{/each}
