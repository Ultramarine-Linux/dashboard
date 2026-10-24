<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import SegmentedControl from '$lib/components/segmented-control.svelte';
	import {
		listManagedHostQuadlets,
		type HostSummary,
		type ManagedHostQuadletFile,
		type ManagedHostQuadletScope
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import { t, type TranslationKey } from '$lib/i18n';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/lucide/refresh-cw';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	let scope = $state<ManagedHostQuadletScope>('user');
	let baseDir = $state<string | null>(null);
	let filesBaseDir = $state<string | null>(null);
	let files = $state<ManagedHostQuadletFile[]>([]);
	let loading = $state(false);
	let actionError = $state('');
	let loadedKey = $state('');

	const quadlets = $derived(files.filter((file) => file.quadlet));
	const companionFiles = $derived(files.filter((file) => !file.quadlet));

	$effect(() => {
		const key = scope;
		if (loadedKey === key) return;
		loadedKey = key;
		loadQuadlets();
	});

	async function loadQuadlets() {
		if (loading) return;
		loading = true;
		actionError = '';
		try {
			const result = await listManagedHostQuadlets({ scope });
			baseDir = result.baseDir;
			filesBaseDir = result.filesBaseDir;
			files = result.files;
		} catch (err) {
			actionError = getErrorMessage(err, t('quadlets.loadFailed'));
		} finally {
			loading = false;
		}
	}

	function editQuadlet(filename: string) {
		goto(`/quadlets/${encodeURIComponent(filename)}?scope=${scope}`);
	}

	const scopeOptions = $derived<{ value: ManagedHostQuadletScope; label: string }[]>([
		{ value: 'user', label: t('quadlets.scope.user') },
		{ value: 'system', label: t('quadlets.scope.system') }
	]);
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('nav.quadlets')}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{t('quadlets.subtitle')}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<SegmentedControl
				label={t('quadlets.scope.label')}
				options={scopeOptions}
				value={scope}
				onchange={(next) => (scope = next)}
			/>
			<Button variant="outline" size="sm" class="gap-2" onclick={loadQuadlets} disabled={loading}>
				{#if loading}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<RefreshCw class="size-3.5" />
				{/if}
				{t('common.refresh')}
			</Button>
			<Button size="sm" class="gap-2" onclick={() => goto(`/quadlets/create?scope=${scope}`)}>
				<Plus class="size-3.5" />
				{t('quadlets.new')}
			</Button>
		</div>
	</div>

	{#if baseDir}
		<div class="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
			<p>{t('quadlets.unitsDir', { path: baseDir })}</p>
			{#if filesBaseDir}
				<p>{t('quadlets.filesDir', { path: filesBaseDir })}</p>
			{/if}
		</div>
	{/if}

	{#if actionError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{actionError}
		</div>
	{/if}

	<div class="mt-5 overflow-hidden border border-border">
		{#if loading && files.length === 0}
			<div class="flex items-center gap-2 p-4 text-xs text-muted-foreground">
				<Loader2 class="size-3.5 animate-spin" />
				{t('quadlets.loading')}
			</div>
		{:else if quadlets.length === 0}
			<div class="p-4 text-xs text-muted-foreground">{t('quadlets.empty')}</div>
		{:else}
			<div class="overflow-auto">
				<table class="w-full min-w-[640px] text-left text-xs">
					<thead class="border-b border-border bg-muted/30 text-muted-foreground">
						<tr>
							<th class="px-3 py-2 font-medium">{t('quadlets.table.unit')}</th>
							<th class="px-3 py-2 font-medium">{t('quadlets.table.path')}</th>
							<th class="px-3 py-2 text-right font-medium">{t('common.actions')}</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each quadlets as file (file.filename)}
							<tr>
								<td class="px-3 py-2 font-medium text-foreground">{file.filename}</td>
								<td class="max-w-96 px-3 py-2 font-mono text-muted-foreground">
									<span class="block truncate">{file.path ?? baseDir ?? t('common.unknown')}</span>
								</td>
								<td class="px-3 py-2 text-right">
									<Button
										variant="outline"
										size="sm"
										class="h-7 px-2 text-[11px]"
										onclick={() => editQuadlet(file.filename)}
									>
										{t('common.edit')}
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	{#if companionFiles.length > 0}
		<section class="mt-5">
			<h2 class="text-sm font-semibold text-foreground">{t('quadlets.companionFiles')}</h2>
			<div class="mt-3 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2">
				{#each companionFiles as file (file.filename)}
					<div class="min-w-0 bg-background p-3">
						<p class="truncate font-mono text-xs text-foreground">{file.filename}</p>
						<p class="mt-1 truncate font-mono text-[11px] text-muted-foreground">
							{file.path ?? filesBaseDir ?? t('common.unknown')}
						</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</section>
