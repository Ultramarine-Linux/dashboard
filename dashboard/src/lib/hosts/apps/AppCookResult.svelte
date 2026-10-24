<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ManagedHostAppWriteResult } from '#lib/remote/managed-hosts.remote.js';
	import ChevronDown from '~icons/lucide/chevron-down';
	import ChevronUp from '~icons/lucide/chevron-up';
	import type { Snippet } from 'svelte';

	let {
		title,
		result,
		actions
	}: {
		title: string;
		result: ManagedHostAppWriteResult;
		actions?: Snippet;
	} = $props();

	let showSystemdCommands = $state(false);
</script>

<div class="space-y-4 border border-border p-4">
	<div class="min-w-0">
		<h3 class="text-sm font-semibold text-foreground">{title}</h3>
		<p class="mt-1 font-mono text-xs break-all text-muted-foreground">{result.bundleDir}</p>
	</div>

	{#if result.units.length > 0}
		<div>
			<p class="text-xs font-medium text-foreground">{t('apps.unitsInstalled')}</p>
			<ul class="mt-2 space-y-1 font-mono text-xs break-all text-muted-foreground">
				{#each result.units as unit (unit)}
					<li>{unit}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if result.services.length > 0}
		<div>
			<p class="text-xs font-medium text-foreground">{t('apps.servicesLabel')}</p>
			<ul class="mt-2 space-y-1 font-mono text-xs break-all text-muted-foreground">
				{#each result.services as service (service)}
					<li>{service}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if result.systemdCommands.length > 0}
		<div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="gap-2"
				onclick={() => (showSystemdCommands = !showSystemdCommands)}
			>
				{#if showSystemdCommands}
					<ChevronUp class="size-3.5" />
					{t('apps.hideSystemd')}
				{:else}
					<ChevronDown class="size-3.5" />
					{t('apps.showSystemd')}
				{/if}
			</Button>
			{#if showSystemdCommands}
				<div
					class="mt-2 space-y-1 border border-border bg-muted/20 p-3 font-mono text-xs break-all text-muted-foreground"
				>
					{#each result.systemdCommands as command, index (index)}
						<p>{command}</p>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if actions}
		<div class="flex flex-wrap gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
