<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { dispatchManagedHostCommand, type ManagedHost } from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import Send from '~icons/lucide/send';
	import { parseHostCapabilities } from '$lib/hosts/capabilities';

	type PageData = {
		host: ManagedHost;
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
				hostId: data.host.id,
				module: moduleName,
				action: actionName,
				payloadJson
			});
			responseJson = formatJson(response);
		} catch (err) {
			actionError = getErrorMessage(err, 'Command failed.');
		} finally {
			dispatching = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div>
		<h2 class="text-sm font-semibold text-foreground">Dispatch Command</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			Send a Tetra command envelope through the dashboard server.
		</p>
	</div>

	<div class="mt-4 grid gap-4 lg:max-w-2xl">
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="module">Module</Label>
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
						No capabilities cached for this host. Refresh from the host toolbar to populate.
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="action">Action</Label>
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
			<Label for="payload">Payload JSON</Label>
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
			Dispatch
		</Button>

		{#if responseJson}
			<pre
				class="max-h-80 overflow-auto border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">{responseJson}</pre>
		{/if}
	</div>
</section>
