<script lang="ts">
	import { t, tn } from '#lib/i18n/index.js';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { confirmDestructive } from '#lib/confirm.svelte.js';
	import {
		deleteManagedHostReverseProxySite,
		listManagedHostReverseProxySites,
		reloadManagedHostReverseProxy,
		writeManagedHostReverseProxySite,
		type HostSummary,
		type ManagedHostReverseProxySite
	} from '#lib/remote/managed-hosts.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import Loader2 from '~icons/lucide/loader-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import Trash from '~icons/lucide/trash';
	import AlertTriangle from '~icons/nucleo/alert-triangle';
	import Globe from '~icons/nucleo/globe';

	type PageData = {
		host: HostSummary;
	};

	let { data }: { data: PageData } = $props();
	const host = $derived(data.host);

	let sites = $state<ManagedHostReverseProxySite[]>([]);
	let configDir = $state<string | null>(null);
	let loading = $state(false);
	let saving = $state(false);
	let reloading = $state(false);
	let deletingDomain = $state('');
	let error = $state('');
	let editingDomain = $state<string | null>(null);
	let formOpen = $state(false);
	let form = $state({ domain: '', upstream: '', tls: true });

	$effect(() => {
		untrack(() => loadSites());
	});

	function resetForm() {
		form = { domain: '', upstream: '', tls: true };
		editingDomain = null;
		formOpen = false;
	}

	function startCreate() {
		form = { domain: '', upstream: '', tls: true };
		editingDomain = null;
		formOpen = true;
	}

	function startEdit(site: ManagedHostReverseProxySite) {
		form = { domain: site.domain, upstream: site.upstream, tls: site.tls };
		editingDomain = site.domain;
		formOpen = true;
	}

	async function loadSites() {
		if (loading) return;
		loading = true;
		error = '';
		try {
			const result = await listManagedHostReverseProxySites();
			sites = result.sites;
			configDir = result.configDir;
		} catch (err) {
			error = getErrorMessage(err, t('proxy.loadFailed'));
		} finally {
			loading = false;
		}
	}

	async function saveSite() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			if (editingDomain && editingDomain !== form.domain) {
				await deleteManagedHostReverseProxySite({
					domain: editingDomain
				});
			}
			const saved = await writeManagedHostReverseProxySite({
				...form
			});
			sites = [
				saved,
				...sites.filter((site) => site.domain !== saved.domain && site.domain !== editingDomain)
			].sort((left, right) => left.domain.localeCompare(right.domain));
			resetForm();
		} catch (err) {
			error = getErrorMessage(err, t('proxy.saveFailed'));
		} finally {
			saving = false;
		}
	}

	async function deleteSite(site: ManagedHostReverseProxySite) {
		if (deletingDomain) return;
		const ok = await confirmDestructive({
			title: t('proxy.deleteTitle'),
			description: host.hostname
				? t('proxy.deleteDescription', { domain: site.domain, host: host.hostname })
				: t('proxy.deleteDescriptionThisServer', { domain: site.domain }),
			confirmWord: site.domain,
			confirmLabel: t('proxy.deleteRoute')
		});
		if (!ok) return;

		deletingDomain = site.domain;
		error = '';
		try {
			await deleteManagedHostReverseProxySite({
				domain: site.domain
			});
			sites = sites.filter((entry) => entry.domain !== site.domain);
		} catch (err) {
			error = getErrorMessage(err, t('proxy.deleteFailed'));
		} finally {
			deletingDomain = '';
		}
	}

	async function reloadProxy() {
		if (reloading) return;
		reloading = true;
		error = '';
		try {
			await reloadManagedHostReverseProxy();
		} catch (err) {
			error = getErrorMessage(err, t('proxy.reloadFailed'));
		} finally {
			reloading = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-col gap-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
					<Globe class="size-5 text-muted-foreground" />
					{t('proxy.title')}
				</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
					{t('proxy.description')}
				</p>
				{#if configDir}
					<p class="mt-2 text-xs text-muted-foreground">
						{t('proxy.configDir')}
						<code class="border border-border bg-muted/30 px-1.5 py-0.5 text-foreground"
							>{configDir}</code
						>
					</p>
				{/if}
			</div>

			<div class="flex shrink-0 gap-2">
				<Button variant="outline" size="sm" class="gap-1.5" onclick={loadSites} {loading}>
					<RefreshCw class="size-3.5" />
					{t('common.refresh')}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="gap-1.5"
					onclick={reloadProxy}
					loading={reloading}
				>
					<RefreshCw class="size-3.5" />
					{t('proxy.reloadCaddy')}
				</Button>
				<Button size="sm" class="gap-1.5" onclick={startCreate} disabled={formOpen}>
					<Plus class="size-3.5" />
					{t('proxy.newRoute')}
				</Button>
			</div>
		</div>

		{#if error}
			<div
				class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
			>
				<AlertTriangle class="size-4 shrink-0" />{error}
			</div>
		{/if}

		{#if formOpen}
			<div class="border border-border/60 bg-background/30 p-4">
				<div class="mb-4">
					<h2 class="text-sm font-semibold text-foreground">
						{editingDomain ? t('proxy.editRoute') : t('proxy.createRoute')}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{t('proxy.exampleUpstreamsBefore')} <code>127.0.0.1:8080</code>,
						<code>localhost:3000</code>, {t('proxy.exampleUpstreamsOr')}
						<code>http://app:80</code>.
					</p>
				</div>
				<form
					class="grid gap-4 lg:grid-cols-2"
					onsubmit={(event) => {
						event.preventDefault();
						saveSite();
					}}
				>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						{t('proxy.domain')}
						<Input bind:value={form.domain} placeholder="app.example.com" required />
					</label>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						{t('proxy.upstream')}
						<Input bind:value={form.upstream} placeholder="127.0.0.1:8080" required />
					</label>
					<div class="flex items-center gap-2 lg:col-span-2">
						<Switch bind:checked={form.tls} />
						<span class="text-sm text-foreground">{t('proxy.enableHttps')}</span>
					</div>
					<div class="flex items-center justify-end gap-2 lg:col-span-2">
						<Button type="button" variant="outline" onclick={resetForm}>{t('common.cancel')}</Button
						>
						<Button type="submit" loading={saving}
							>{editingDomain ? t('proxy.saveRoute') : t('proxy.createRouteButton')}</Button
						>
					</div>
				</form>
			</div>
		{/if}

		<div class="overflow-hidden rounded-md border border-border/60">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
					<tr>
						<th class="px-4 py-2 font-medium">{t('proxy.domain')}</th>
						<th class="px-4 py-2 font-medium">{t('proxy.upstream')}</th>
						<th class="px-4 py-2 font-medium">{t('proxy.tls')}</th>
						<th class="px-4 py-2 text-right font-medium">{t('common.actions')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border/50">
					{#each sites as site (site.domain)}
						<tr>
							<td class="px-4 py-3 align-top">
								<div class="font-medium text-foreground">{site.domain}</div>
								{#if site.path}<div class="mt-1 font-mono text-[11px] text-muted-foreground">
										{site.path}
									</div>{/if}
							</td>
							<td class="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
								{site.upstream}
							</td>
							<td
								class="px-4 py-3 align-top text-xs {site.tls
									? 'text-emerald-400'
									: 'text-muted-foreground'}"
							>
								{site.tls ? t('proxy.automaticHttps') : t('common.disabled')}
							</td>
							<td class="px-4 py-3 align-top">
								<div class="flex justify-end gap-1.5">
									<Button
										variant="outline"
										size="icon-sm"
										onclick={() => startEdit(site)}
										aria-label={t('proxy.editRouteAria')}
									>
										<Pencil class="size-3.5" />
									</Button>
									<Button
										variant="destructive"
										size="icon-sm"
										loading={deletingDomain === site.domain}
										onclick={() => deleteSite(site)}
										aria-label={t('proxy.deleteRoute')}
									>
										<Trash class="size-3.5" />
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if loading && sites.length === 0}
			<div class="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
				<Loader2 class="mx-auto mb-2 size-4 animate-spin" />
				{t('proxy.loading')}
			</div>
		{:else if sites.length === 0}
			<div class="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
				{t('proxy.empty')}
			</div>
		{/if}
	</div>
</section>
