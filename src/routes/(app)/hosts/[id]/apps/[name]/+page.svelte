<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppRecipe } from '$lib/apps/catalog';
	import {
		defaultRecipeValues,
		validateRecipeValues,
		valuesForSubmit,
		type AppValueMap
	} from '$lib/apps/params';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { confirmDestructive } from '$lib/confirm.svelte';
	import {
		getManagedHostApp,
		getManagedHostAppServiceLogs,
		readManagedHostAppFile,
		removeManagedHostApp,
		updateManagedHostApp,
		type ManagedHost,
		type ManagedHostAppDetail,
		type ManagedHostAppService,
		type ManagedHostAppStatus,
		type ManagedHostAppWriteResult,
		type ManagedHostQuadletScope
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import Pencil from '~icons/lucide/pencil';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import ScrollText from '~icons/lucide/scroll-text';
	import Trash2 from '~icons/nucleo/trash';
	import AppCookResult from '../lib/AppCookResult.svelte';
	import AppValuesForm from '../lib/AppValuesForm.svelte';

	type PageData = {
		host: ManagedHost;
	};

	type LogPanel = {
		expanded: boolean;
		loading: boolean;
		logs: string | null;
		error: string;
	};

	type FilePanel = {
		expanded: boolean;
		loading: boolean;
		contents: string | null;
		error: string;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	const appName = $derived(decodeURIComponent(page.params.name ?? ''));
	const scope = $derived<ManagedHostQuadletScope>(
		page.url.searchParams.get('scope') === 'system' ? 'system' : 'user'
	);
	let detail = $state<ManagedHostAppDetail | null>(null);
	let loading = $state(false);
	let actionError = $state('');
	let loadedKey = $state('');
	let logPanels = $state<Record<string, LogPanel>>({});
	let filePanels = $state<Record<string, FilePanel>>({});
	let editing = $state(false);
	let editValues = $state<AppValueMap>({});
	let saving = $state(false);
	let editError = $state('');
	let editResult = $state<ManagedHostAppWriteResult | null>(null);
	let removing = $state(false);

	const recipe = $derived(detail ? getAppRecipe(detail.manifest.recipe_id) : null);
	const editErrors = $derived(recipe && editing ? validateRecipeValues(recipe, editValues) : []);

	$effect(() => {
		const key = `${host.id}:${scope}:${appName}`;
		if (!appName || loadedKey === key) return;
		loadedKey = key;
		detail = null;
		logPanels = {};
		filePanels = {};
		editing = false;
		editResult = null;
		loadApp();
	});

	async function loadApp() {
		if (loading) return;
		loading = true;
		actionError = '';
		try {
			detail = await getManagedHostApp({ hostId: host.id, scope, name: appName });
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to load app.');
		} finally {
			loading = false;
		}
	}

	function formatEpoch(seconds: number) {
		return seconds > 0 ? new Date(seconds * 1000).toLocaleString() : 'Unknown';
	}

	function statusVariant(status: ManagedHostAppStatus) {
		if (status === 'running') return 'default';
		if (status === 'failed') return 'destructive';
		if (status === 'stopped') return 'secondary';
		return 'outline';
	}

	function serviceBadgeVariant(state: string) {
		if (state === 'active') return 'default';
		if (state === 'failed') return 'destructive';
		return 'secondary';
	}

	function setLogPanel(name: string, panel: LogPanel) {
		logPanels = { ...logPanels, [name]: panel };
	}

	async function toggleLogs(service: ManagedHostAppService) {
		const current = logPanels[service.name];
		if (current?.expanded) {
			setLogPanel(service.name, { ...current, expanded: false });
			return;
		}
		await refreshLogs(service.name);
	}

	async function refreshLogs(name: string) {
		const current = logPanels[name];
		setLogPanel(name, { expanded: true, loading: true, logs: current?.logs ?? null, error: '' });
		try {
			const logs = await getManagedHostAppServiceLogs({
				hostId: host.id,
				scope,
				service: name,
				lines: 200
			});
			setLogPanel(name, { expanded: true, loading: false, logs, error: '' });
		} catch (err) {
			setLogPanel(name, {
				expanded: true,
				loading: false,
				logs: null,
				error: getErrorMessage(err, 'Failed to load service logs.')
			});
		}
	}

	function setFilePanel(filename: string, panel: FilePanel) {
		filePanels = { ...filePanels, [filename]: panel };
	}

	async function toggleFile(filename: string) {
		const current = filePanels[filename];
		if (current?.expanded) {
			setFilePanel(filename, { ...current, expanded: false });
			return;
		}
		setFilePanel(filename, { expanded: true, loading: true, contents: null, error: '' });
		try {
			const file = await readManagedHostAppFile({
				hostId: host.id,
				scope,
				name: appName,
				filename
			});
			setFilePanel(filename, {
				expanded: true,
				loading: false,
				contents: file.contents,
				error: ''
			});
		} catch (err) {
			setFilePanel(filename, {
				expanded: true,
				loading: false,
				contents: null,
				error: getErrorMessage(err, 'Failed to read file.')
			});
		}
	}

	function buildEditValues(): AppValueMap {
		if (!recipe || !detail) return {};
		const values = defaultRecipeValues(recipe);
		for (const parameter of recipe.parameters) {
			const raw = detail.manifest.values[parameter.key];
			if (raw === undefined || raw === null) continue;
			if (parameter.type === 'boolean') {
				values[parameter.key] = raw === true;
			} else if (parameter.type === 'integer') {
				const number = typeof raw === 'number' ? raw : Number(raw);
				if (Number.isFinite(number)) values[parameter.key] = Math.trunc(number);
			} else if (typeof raw === 'string' || typeof raw === 'number') {
				values[parameter.key] = String(raw);
			}
		}
		return values;
	}

	function toggleEditing() {
		if (editing) {
			editing = false;
			return;
		}
		editValues = buildEditValues();
		editError = '';
		editResult = null;
		editing = true;
	}

	async function saveEdit() {
		if (saving || !recipe || editErrors.length > 0) return;
		saving = true;
		editError = '';
		try {
			editResult = await updateManagedHostApp({
				hostId: host.id,
				scope,
				name: appName,
				valuesJson: JSON.stringify(valuesForSubmit(recipe, editValues))
			});
			editing = false;
			await loadApp();
		} catch (err) {
			editError = getErrorMessage(err, 'Failed to update app.');
		} finally {
			saving = false;
		}
	}

	async function removeApp() {
		if (removing || !detail) return;
		const ok = await confirmDestructive({
			title: 'Remove app',
			description: `This stops and disables the app's services, deletes its Quadlet units, and removes the bundle directory. Volumes created by Podman are kept.`,
			confirmWord: appName,
			confirmLabel: 'Remove app'
		});
		if (!ok) return;

		removing = true;
		actionError = '';
		try {
			await removeManagedHostApp({ hostId: host.id, scope, name: appName });
			await goto(`/hosts/${host.id}/apps`);
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to remove app.');
		} finally {
			removing = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="truncate text-sm font-semibold text-foreground">{appName}</h1>
				{#if detail}
					<Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
					<Badge variant="secondary">{scope}</Badge>
				{/if}
			</div>
			{#if detail}
				<p class="mt-1 text-xs text-muted-foreground">
					{recipe?.name ?? detail.manifest.recipe_id} · v{detail.manifest.recipe_version}
				</p>
				<p class="mt-1 font-mono text-xs break-all text-muted-foreground">{detail.bundleDir}</p>
				<p class="mt-1 text-xs text-muted-foreground">
					Created {formatEpoch(detail.manifest.created_at)} · Updated {formatEpoch(
						detail.manifest.updated_at
					)}
				</p>
			{/if}
		</div>
		<Button variant="outline" size="sm" class="gap-2" onclick={loadApp} disabled={loading}>
			{#if loading}
				<Loader2 class="size-3.5 animate-spin" />
			{:else}
				<RefreshCw class="size-3.5" />
			{/if}
			Refresh
		</Button>
	</div>

	{#if actionError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{actionError}
		</div>
	{/if}

	{#if loading && !detail}
		<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
			<Loader2 class="size-3.5 animate-spin" />
			Loading app
		</div>
	{:else if detail}
		<section class="mt-5">
			<h2 class="text-sm font-semibold text-foreground">Services</h2>
			<div class="mt-3 divide-y divide-border border border-border">
				{#each detail.services as service (service.name)}
					{@const panel = logPanels[service.name]}
					<div class="p-3">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-xs font-medium text-foreground">
										{service.name}
									</span>
									<Badge variant={serviceBadgeVariant(service.active)}>{service.active}</Badge>
									<Badge variant={serviceBadgeVariant(service.sub)}>{service.sub}</Badge>
								</div>
								{#if service.description}
									<p class="mt-1 text-xs text-muted-foreground">{service.description}</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if panel?.expanded}
									<Button
										variant="ghost"
										size="sm"
										class="h-7 gap-1.5 px-2 text-[11px]"
										onclick={() => refreshLogs(service.name)}
										disabled={panel.loading}
									>
										{#if panel.loading}
											<Loader2 class="size-3 animate-spin" />
										{:else}
											<RefreshCw class="size-3" />
										{/if}
										Refresh
									</Button>
								{/if}
								<Button
									variant="outline"
									size="sm"
									class="h-7 gap-1.5 px-2 text-[11px]"
									onclick={() => toggleLogs(service)}
								>
									<ScrollText class="size-3" />
									{panel?.expanded ? 'Hide logs' : 'Logs'}
								</Button>
							</div>
						</div>
						{#if panel?.expanded}
							{#if panel.error}
								<div
									class="mt-3 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
								>
									{panel.error}
								</div>
							{:else if panel.logs !== null}
								<!-- svelte-ignore a11y_no_noninteractive_tabindex - Axe requires keyboard access for this scrollable code region. -->
								<pre
									role="region"
									aria-label={`Logs for ${service.name}`}
									tabindex="0"
									class="mt-3 max-h-80 overflow-auto border border-border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap">{panel.logs}</pre>
							{:else}
								<div class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
									<Loader2 class="size-3.5 animate-spin" />
									Loading logs
								</div>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="p-3 text-xs text-muted-foreground">No services reported for this app.</div>
				{/each}
			</div>
		</section>

		<section class="mt-5">
			<h2 class="text-sm font-semibold text-foreground">Units</h2>
			<div class="mt-3 divide-y divide-border border border-border">
				{#each detail.units as unit (unit.filename)}
					<div class="flex flex-wrap items-center gap-2 p-3">
						<a
							class="font-mono text-xs font-medium text-foreground underline-offset-4 hover:underline"
							href={`/hosts/${host.id}/quadlets/${encodeURIComponent(unit.filename)}?scope=${scope}`}
						>
							{unit.filename}
						</a>
						{#if !unit.exists}
							<span class="text-xs text-destructive">missing</span>
						{/if}
					</div>
				{:else}
					<div class="p-3 text-xs text-muted-foreground">No units recorded for this app.</div>
				{/each}
			</div>
		</section>

		<section class="mt-5">
			<h2 class="text-sm font-semibold text-foreground">Files</h2>
			<div class="mt-3 divide-y divide-border border border-border">
				{#each detail.files as file (file.filename)}
					{@const panel = filePanels[file.filename]}
					<div class="p-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex min-w-0 items-center gap-2">
								<span class="truncate font-mono text-xs font-medium text-foreground">
									{file.filename}
								</span>
								{#if !file.exists}
									<span class="text-xs text-destructive">missing</span>
								{/if}
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-7 gap-1.5 px-2 text-[11px]"
								disabled={!file.exists || panel?.loading === true}
								onclick={() => toggleFile(file.filename)}
							>
								{#if panel?.loading}
									<Loader2 class="size-3 animate-spin" />
								{/if}
								{panel?.expanded ? 'Hide' : 'View'}
							</Button>
						</div>
						{#if panel?.expanded}
							{#if panel.error}
								<div
									class="mt-3 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
								>
									{panel.error}
								</div>
							{:else if panel.contents !== null}
								<!-- svelte-ignore a11y_no_noninteractive_tabindex - Axe requires keyboard access for this scrollable code region. -->
								<pre
									role="region"
									aria-label={`Contents of ${file.filename}`}
									tabindex="0"
									class="mt-3 max-h-80 overflow-auto border border-border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap">{panel.contents}</pre>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="p-3 text-xs text-muted-foreground">
						No companion files recorded for this app.
					</div>
				{/each}
			</div>
		</section>

		<section class="mt-5 border border-border p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-foreground">Recipe Values</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Re-render the app with updated parameter values.
					</p>
				</div>
				<Button variant="outline" size="sm" class="gap-2" onclick={toggleEditing}>
					<Pencil class="size-3.5" />
					{editing ? 'Cancel' : 'Edit values'}
				</Button>
			</div>

			{#if editResult}
				<div class="mt-4">
					<AppCookResult title="App re-rendered" result={editResult}>
						{#snippet actions()}
							<Button variant="outline" size="sm" onclick={() => (editResult = null)}>
								Dismiss
							</Button>
						{/snippet}
					</AppCookResult>
				</div>
			{/if}

			{#if editing}
				{#if recipe}
					<div class="mt-4 space-y-5">
						<div class="space-y-2">
							<Label for="edit-app-name">App name</Label>
							<Input id="edit-app-name" value={appName} readonly />
							<p class="text-xs text-muted-foreground">Apps cannot be renamed.</p>
						</div>

						<AppValuesForm {recipe} bind:values={editValues} idPrefix="edit-param" />

						{#if editErrors.length > 0}
							<div class="space-y-1">
								{#each editErrors as formError (formError)}
									<p class="text-xs text-destructive">{formError}</p>
								{/each}
							</div>
						{/if}

						{#if editError}
							<div
								class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
							>
								{editError}
							</div>
						{/if}

						<Button class="gap-2" onclick={saveEdit} disabled={saving || editErrors.length > 0}>
							{#if saving}
								<Loader2 class="size-3.5 animate-spin" />
							{/if}
							Re-render and restart
						</Button>
					</div>
				{:else}
					<div class="mt-4 border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
						This app was cooked from a recipe outside the dashboard catalog, so value editing is
						unavailable.
					</div>
				{/if}
			{/if}
		</section>

		<section class="mt-5 border border-destructive/30 p-4">
			<h2 class="text-sm font-semibold text-foreground">Danger Zone</h2>
			<p class="mt-1 text-xs text-muted-foreground">
				Removing an app stops and disables its services, deletes its Quadlet units, and removes the
				bundle directory.
			</p>
			<Button
				variant="outline"
				size="sm"
				class="mt-3 gap-2 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
				onclick={removeApp}
				disabled={removing}
			>
				{#if removing}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<Trash2 class="size-3.5" />
				{/if}
				Remove app
			</Button>
		</section>
	{/if}
</section>
