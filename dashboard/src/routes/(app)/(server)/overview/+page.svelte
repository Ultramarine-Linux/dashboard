<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { HostSummary } from '#lib/remote/managed-hosts.remote.js';
	import Check from '~icons/lucide/check';
	import ChevronDown from '~icons/lucide/chevron-down';
	import Minus from '~icons/lucide/minus';
	import { parseHostCapabilities, type ModuleStatus } from '#lib/hosts/capabilities.js';

	let { data }: { data: { host: HostSummary } } = $props();
	const host = $derived(data.host);
	const parsed = $derived(parseHostCapabilities(host.capabilities));
	let showRawCapabilities = $state(false);

	function formatJson(value: unknown) {
		return JSON.stringify(value ?? null, null, 2);
	}

	function formatOs(value: string | null | undefined) {
		if (!value) return t('common.unknown');
		const normalized = value.trim().toLowerCase();
		if (normalized.includes('ultramarine')) return 'Ultramarine';
		if (normalized === 'linux') return 'Linux';
		return value;
	}

	function statusVariant(status: ModuleStatus) {
		return status === 'available' ? 'default' : 'secondary';
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex - Axe requires keyboard access for this scrollable region. -->
<div
	class="min-h-0 flex-1 overflow-auto bg-background"
	role="region"
	aria-label={t('overview.regionLabel')}
	tabindex="0"
>
	<div class="grid border-b border-border bg-background lg:grid-cols-[320px_1fr]">
		<section class="border-b border-border p-4 sm:p-6 lg:border-r lg:border-b-0">
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{t('overview.hostDetails')}
			</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{t('overview.hostDetailsDescription')}
			</p>

			<div class="mt-5 divide-y divide-border border border-border">
				{#each [['overview.hostname', host.hostname ?? t('common.unknown')], ['overview.os', formatOs(host.os)], ['overview.arch', host.arch ?? t('common.unknown')]] as const as [labelKey, value] (labelKey)}
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<span class="text-xs text-muted-foreground">{t(labelKey)}</span>
						<span class="truncate text-right text-xs font-medium text-foreground">{value}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="p-4 sm:p-6">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-sm font-semibold text-foreground">{t('overview.capabilities')}</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{t('overview.capabilitiesDescription')}
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 gap-1.5 px-2.5 text-xs"
					onclick={() => (showRawCapabilities = !showRawCapabilities)}
					aria-expanded={showRawCapabilities}
				>
					<ChevronDown
						class="size-3 transition-transform {showRawCapabilities ? 'rotate-180' : ''}"
					/>
					{t('overview.rawJson')}
				</Button>
			</div>

			{#if parsed.modules.length > 0}
				<ul class="mt-4 divide-y divide-border border border-border">
					{#each parsed.modules as module (module.name)}
						<li class="p-4">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-semibold text-foreground">{module.name}</span>
								<Badge variant={statusVariant(module.status)} class="gap-1 text-[10px]">
									{#if module.status === 'available'}
										<Check class="size-3" />
									{:else}
										<Minus class="size-3" />
									{/if}
									{module.status}
								</Badge>
								{#if module.feature}
									<span
										class="border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
										>{module.feature}</span
									>
								{/if}
							</div>
							{#if module.description}
								<p class="mt-1.5 text-xs text-muted-foreground">{module.description}</p>
							{/if}
							{#if module.actions.length > 0}
								<div class="mt-3 flex flex-wrap gap-1.5">
									{#each module.actions as action (action)}
										<span
											class="border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
											>{action}</span
										>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<div class="mt-4 border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
					{#if parsed.raw}
						{t('overview.noStructuredModules')}
					{:else}
						{t('overview.noModules')}
					{/if}
				</div>
			{/if}

			{#if showRawCapabilities || parsed.raw}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex - Axe requires keyboard access for this scrollable code region. -->
				<pre
					role="region"
					aria-label={t('overview.capabilitiesJsonLabel')}
					tabindex="0"
					class="mt-4 max-h-136 overflow-auto border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">{formatJson(
						host.capabilities
					)}</pre>
			{/if}
		</section>
	</div>
</div>
