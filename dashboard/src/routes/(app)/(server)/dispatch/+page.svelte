<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		dispatchManagedHostCommand,
		type HostSummary
	} from '#lib/remote/managed-hosts.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import Loader2 from '~icons/lucide/loader-2';
	import Send from '~icons/lucide/send';
	import { parseHostCapabilities } from '#lib/hosts/capabilities.js';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	let moduleName = $state('settings');
	let actionName = $state('get_system');
	let payloadJson = $state('{}');
	let responseJson = $state('');
	let actionError = $state('');
	let dispatching = $state(false);

	const parsed = $derived(parseHostCapabilities(data.host.capabilities));
	const modules = $derived(parsed.modules);
	const moduleNames = $derived(modules.map((module) => module.name));
	const selectedModule = $derived(modules.find((module) => module.name === moduleName) ?? null);
	const availableActions = $derived(selectedModule?.actions ?? []);

	// Reconcile the selected module/action when capabilities load or change.
	$effect(() => {
		if (modules.length === 0) return;
		if (!moduleNames.includes(moduleName)) {
			moduleName = moduleNames[0];
			return;
		}
		if (availableActions.length > 0 && !availableActions.includes(actionName)) {
			actionName = availableActions[0];
		}
	});

	function formatJson(value: unknown) {
		return JSON.stringify(value ?? null, null, 2);
	}

	async function dispatchCommand() {
		if (dispatching) return;
		actionError = '';
		responseJson = '';
		dispatching = true;
		try {
			const response = await dispatchManagedHostCommand({
				module: moduleName,
				action: actionName,
				payloadJson
			});
			responseJson = formatJson(response);
		} catch (err) {
			actionError = getErrorMessage(err, t('dispatch.failed'));
		} finally {
			dispatching = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('dispatch.title')}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{t('dispatch.description')}
		</p>
	</div>

	<div class="mt-4 grid gap-4 lg:max-w-2xl">
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="module">{t('dispatch.module')}</Label>
				{#if modules.length > 0}
					<select
						id="module"
						bind:value={moduleName}
						class="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
					>
						{#each moduleNames as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				{:else}
					<Input id="module" bind:value={moduleName} />
					<p class="text-xs text-muted-foreground">
						{t('dispatch.noCapabilities')}
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="action">{t('dispatch.action')}</Label>
				{#if availableActions.length > 0}
					<select
						id="action"
						bind:value={actionName}
						class="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
					>
						{#each availableActions as action (action)}
							<option value={action}>{action}</option>
						{/each}
					</select>
				{:else}
					<Input id="action" bind:value={actionName} />
				{/if}
			</div>
		</div>

		<div class="space-y-2">
			<Label for="payload">{t('dispatch.payloadJson')}</Label>
			<Textarea id="payload" class="min-h-32 font-mono text-xs" bind:value={payloadJson} />
		</div>

		{#if actionError}
			<div class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
				{actionError}
			</div>
		{/if}

		<Button class="w-fit gap-2" onclick={dispatchCommand} disabled={dispatching}>
			{#if dispatching}
				<Loader2 class="size-4 animate-spin" />
			{:else}
				<Send class="size-4" />
			{/if}
			{t('dispatch.dispatch')}
		</Button>

		{#if responseJson}
			<pre
				class="max-h-80 overflow-auto border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">{responseJson}</pre>
		{/if}
	</div>
</section>
