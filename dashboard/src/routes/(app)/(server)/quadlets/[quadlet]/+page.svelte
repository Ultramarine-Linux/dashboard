<script lang="ts">
	import { page } from '$app/state';
	import {
		getManagedHostQuadlet,
		type HostSummary,
		type ManagedHostQuadletDetail,
		type ManagedHostQuadletScope
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import { t } from '$lib/i18n';
	import Loader2 from '~icons/lucide/loader-2';
	import QuadletEditor from '$lib/hosts/quadlets/QuadletEditor.svelte';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);
	const filename = $derived(decodeURIComponent(page.params.quadlet ?? ''));
	const scope = $derived<ManagedHostQuadletScope>(
		page.url.searchParams.get('scope') === 'system' ? 'system' : 'user'
	);
	let detail = $state<ManagedHostQuadletDetail | null>(null);
	let loading = $state(false);
	let actionError = $state('');
	let loadedKey = $state('');

	$effect(() => {
		const key = `${scope}:${filename}`;
		if (!filename || loadedKey === key) return;
		loadedKey = key;
		loadQuadlet();
	});

	async function loadQuadlet() {
		if (loading) return;
		loading = true;
		actionError = '';
		try {
			detail = await getManagedHostQuadlet({
				scope,
				filename
			});
		} catch (err) {
			actionError = getErrorMessage(err, t('quadlets.detail.loadFailed'));
		} finally {
			loading = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-foreground">{filename}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{t('quadlets.detail.subtitle')}
		</p>
	</div>

	{#if actionError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{actionError}
		</div>
	{/if}

	{#if loading && !detail}
		<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
			<Loader2 class="size-3.5 animate-spin" />
			{t('quadlets.detail.loading')}
		</div>
	{:else if detail}
		<div class="mt-5">
			<QuadletEditor {host} {detail} initialScope={scope} />
		</div>
	{/if}
</section>
