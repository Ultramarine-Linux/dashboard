<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { setHostUserMapping, type ManagedHost } from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Check from '~icons/lucide/check';
	import ChevronDown from '~icons/lucide/chevron-down';
	import Minus from '~icons/lucide/minus';
	import { parseHostCapabilities, type ModuleStatus } from '$lib/hosts/capabilities';

	type PageData = {
		host: ManagedHost;
		hostUserMapping: string | null;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	const parsed = $derived(parseHostCapabilities(host.capabilities));
	let showRawCapabilities = $state(false);
	let hostUsername = $state('');
	let savingHostUsername = $state(false);

	$effect(() => {
		hostUsername = data.hostUserMapping ?? '';
	});
	let hostUsernameSaved = $state(false);
	let hostUsernameError = $state('');

	async function saveHostUsername() {
		if (savingHostUsername) return;
		savingHostUsername = true;
		hostUsernameSaved = false;
		hostUsernameError = '';
		try {
			await setHostUserMapping({ hostId: host.id, hostUsername });
			hostUsernameSaved = true;
			setTimeout(() => (hostUsernameSaved = false), 1500);
		} catch (err) {
			hostUsernameError = getErrorMessage(err, 'Failed to save host username.');
		} finally {
			savingHostUsername = false;
		}
	}

	function formatDate(value: number | null) {
		return value ? new Date(value).toLocaleString() : 'Never';
	}

	function formatJson(value: unknown) {
		return JSON.stringify(value ?? null, null, 2);
	}

	function formatOs(value: string | null) {
		if (!value) return 'Unknown';
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
	aria-label="Host overview"
	tabindex="0"
>
	<div class="grid border-b border-border bg-background lg:grid-cols-[320px_1fr]">
		<section class="border-b border-border p-5 lg:border-r lg:border-b-0">
			<h1 class="text-sm font-semibold text-foreground">Host Details</h1>
			<p class="mt-1 text-xs text-muted-foreground">
				Current dashboard state for this Tetra agent.
			</p>

			<div class="mt-5 divide-y divide-border border border-border">
				{#each [['Mode', 'direct_http'], ['Last seen', formatDate(host.lastSeenAt)], ['OS', formatOs(host.os)], ['Arch', host.arch ?? 'Unknown'], ['Agent', host.agentVersion ?? 'Unknown']] as [label, value] (label)}
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<span class="text-xs text-muted-foreground">{label}</span>
						<span class="truncate text-right text-xs font-medium text-foreground">{value}</span>
					</div>
				{/each}
			</div>

			<div class="mt-5 rounded-xs border border-border/60 p-4">
				<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
					<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
						Your username on this host
					</p>
				</div>
				<div class="flex flex-col gap-3">
					<div class="flex flex-col gap-1.5">
						<Label class="text-xs">Host username</Label>
						<Input bind:value={hostUsername} placeholder="Dashboard default" class="h-8 text-xs" />
						<p class="text-xs text-muted-foreground">
							Leave blank to use your dashboard username. This is the account Tetra will run
							unprivileged commands as.
						</p>
					</div>
					{#if hostUsernameError}
						<p class="text-xs text-red-400">{hostUsernameError}</p>
					{/if}
					<Button size="sm" onclick={saveHostUsername} disabled={savingHostUsername} class="w-fit">
						{#if savingHostUsername}
							Saving...
						{:else if hostUsernameSaved}
							<Check class="h-3 w-3" /> Saved
						{:else}
							Save
						{/if}
					</Button>
				</div>
			</div>

			{#if host.lastError}
				<div
					class="mt-5 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
				>
					{host.lastError}
				</div>
			{/if}
		</section>

		<section class="p-5">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-sm font-semibold text-foreground">Capabilities</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Modules exposed by this Tetra agent via `agent.capabilities`.
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
					Raw JSON
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
						No structured module list available. Showing the raw payload below.
					{:else}
						This agent reported no enabled modules.
					{/if}
				</div>
			{/if}

			{#if showRawCapabilities || parsed.raw}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex - Axe requires keyboard access for this scrollable code region. -->
				<pre
					role="region"
					aria-label="Host capabilities JSON"
					tabindex="0"
					class="mt-4 max-h-136 overflow-auto border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">{formatJson(
						host.capabilities
					)}</pre>
			{/if}
		</section>
	</div>
</div>
