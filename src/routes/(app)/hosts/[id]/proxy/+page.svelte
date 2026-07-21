<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { confirmDestructive } from '$lib/confirm.svelte';
	import {
		deleteManagedHostReverseProxySite,
		listManagedHostReverseProxySites,
		reloadManagedHostReverseProxy,
		writeManagedHostReverseProxySite,
		type ManagedHost,
		type ManagedHostReverseProxySite
	} from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import Trash from '~icons/lucide/trash';
	import AlertTriangle from '~icons/nucleo/alert-triangle';
	import Globe from '~icons/nucleo/globe';

	type PageData = {
		host: ManagedHost;
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
	let loadedHostId = $state<string | null>(null);
	let editingDomain = $state<string | null>(null);
	let formOpen = $state(false);
	let form = $state({ domain: '', upstream: '', tls: true });

	$effect(() => {
		if (loadedHostId === host.id) return;
		loadedHostId = host.id;
		loadSites();
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
			const result = await listManagedHostReverseProxySites({ hostId: host.id });
			sites = result.sites;
			configDir = result.configDir;
		} catch (err) {
			error = getErrorMessage(err, 'Failed to load reverse proxy sites.');
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
				await deleteManagedHostReverseProxySite({ hostId: host.id, domain: editingDomain });
			}
			const saved = await writeManagedHostReverseProxySite({ hostId: host.id, ...form });
			sites = [
				saved,
				...sites.filter((site) => site.domain !== saved.domain && site.domain !== editingDomain)
			].sort((left, right) => left.domain.localeCompare(right.domain));
			resetForm();
		} catch (err) {
			error = getErrorMessage(err, 'Failed to save reverse proxy site.');
		} finally {
			saving = false;
		}
	}

	async function deleteSite(site: ManagedHostReverseProxySite) {
		if (deletingDomain) return;
		const ok = await confirmDestructive({
			title: 'Delete reverse proxy site',
			description: `This will remove the route for ${site.domain} from ${host.displayName}.`,
			confirmWord: site.domain,
			confirmLabel: 'Delete route'
		});
		if (!ok) return;

		deletingDomain = site.domain;
		error = '';
		try {
			await deleteManagedHostReverseProxySite({ hostId: host.id, domain: site.domain });
			sites = sites.filter((entry) => entry.domain !== site.domain);
		} catch (err) {
			error = getErrorMessage(err, 'Failed to delete reverse proxy site.');
		} finally {
			deletingDomain = '';
		}
	}

	async function reloadProxy() {
		if (reloading) return;
		reloading = true;
		error = '';
		try {
			await reloadManagedHostReverseProxy({ hostId: host.id });
		} catch (err) {
			error = getErrorMessage(err, 'Failed to reload reverse proxy.');
		} finally {
			reloading = false;
		}
	}
</script>

<section class="min-h-0 flex-1 overflow-auto bg-background p-5">
	<div class="flex flex-col gap-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-lg font-semibold text-foreground">
					<Globe class="size-5 text-muted-foreground" /> Reverse Proxy
				</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
					Create Caddy reverse proxy routes for services running on this host. Tetra writes managed
					site snippets and reloads Caddy after changes.
				</p>
				{#if configDir}
					<p class="mt-2 text-xs text-muted-foreground">
						Managed config directory:
						<code class="border border-border bg-muted/30 px-1.5 py-0.5 text-foreground"
							>{configDir}</code
						>
					</p>
				{/if}
			</div>

			<div class="flex shrink-0 gap-2">
				<Button variant="outline" size="sm" class="gap-1.5" onclick={loadSites} {loading}>
					<RefreshCw class="size-3.5" /> Refresh
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="gap-1.5"
					onclick={reloadProxy}
					loading={reloading}
				>
					<RefreshCw class="size-3.5" /> Reload Caddy
				</Button>
				<Button size="sm" class="gap-1.5" onclick={startCreate} disabled={formOpen}>
					<Plus class="size-3.5" /> New route
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
						{editingDomain ? 'Edit proxy route' : 'Create proxy route'}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Example upstreams: <code>127.0.0.1:8080</code>, <code>localhost:3000</code>, or
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
						Domain
						<Input bind:value={form.domain} placeholder="app.example.com" required />
					</label>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						Upstream
						<Input bind:value={form.upstream} placeholder="127.0.0.1:8080" required />
					</label>
					<div class="flex items-center gap-2 lg:col-span-2">
						<Switch bind:checked={form.tls} />
						<span class="text-sm text-foreground">Enable automatic HTTPS</span>
					</div>
					<div class="flex items-center justify-end gap-2 lg:col-span-2">
						<Button type="button" variant="outline" onclick={resetForm}>Cancel</Button>
						<Button type="submit" loading={saving}
							>{editingDomain ? 'Save route' : 'Create route'}</Button
						>
					</div>
				</form>
			</div>
		{/if}

		<div class="overflow-hidden rounded-md border border-border/60">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
					<tr>
						<th class="px-4 py-2 font-medium">Domain</th>
						<th class="px-4 py-2 font-medium">Upstream</th>
						<th class="px-4 py-2 font-medium">TLS</th>
						<th class="px-4 py-2 text-right font-medium">Actions</th>
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
								{site.tls ? 'Automatic HTTPS' : 'Disabled'}
							</td>
							<td class="px-4 py-3 align-top">
								<div class="flex justify-end gap-1.5">
									<Button
										variant="outline"
										size="icon-sm"
										onclick={() => startEdit(site)}
										aria-label="Edit route"
									>
										<Pencil class="size-3.5" />
									</Button>
									<Button
										variant="destructive"
										size="icon-sm"
										loading={deletingDomain === site.domain}
										onclick={() => deleteSite(site)}
										aria-label="Delete route"
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
				<Loader2 class="mx-auto mb-2 size-4 animate-spin" /> Loading reverse proxy routes…
			</div>
		{:else if sites.length === 0}
			<div class="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
				No reverse proxy routes yet. Create one to expose a local service by domain.
			</div>
		{/if}
	</div>
</section>
