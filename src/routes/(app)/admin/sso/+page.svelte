<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { AdminState, type AdminPageData, type SsoClientInput } from '$lib/state/admin.svelte';
	import type { SsoClient } from '$lib/remote/sso-clients.remote';
	import Check from '~icons/lucide/check';
	import Copy from '~icons/lucide/copy';
	import Loader2 from '~icons/lucide/loader-2';
	import Pencil from '~icons/lucide/pencil';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/nucleo/refresh-cw';
	import Trash from '~icons/lucide/trash';
	import AlertTriangle from '~icons/nucleo/alert-triangle';

	let { data }: { data: AdminPageData } = $props();
	const admin = new AdminState(untrack(() => data));
	$effect(() => admin.sync(data));

	const metadataPlaceholder = '{"service":"grafana"}';

	const defaultForm: SsoClientInput = {
		name: '',
		clientId: '',
		type: 'web',
		redirectUrls: '',
		icon: '',
		metadata: '',
		disabled: false
	};

	let creating = $state(false);
	let editingId = $state<string | null>(null);
	let copiedSecret = $state(false);
	let form = $state<SsoClientInput>({ ...defaultForm });

	const sortedClients = $derived(
		[...admin.ssoClients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
	);

	function resetForm() {
		form = { ...defaultForm };
		editingId = null;
		creating = false;
		admin.newSsoClientSecret = null;
	}

	function clientToForm(client: SsoClient): SsoClientInput {
		return {
			name: client.name,
			clientId: client.clientId,
			type: client.type,
			redirectUrls: client.redirectUrls.join('\n'),
			icon: client.icon ?? '',
			metadata: client.metadata ?? '',
			disabled: client.disabled
		};
	}

	function startCreate() {
		form = { ...defaultForm };
		editingId = null;
		creating = true;
		admin.newSsoClientSecret = null;
	}

	function startEdit(client: SsoClient) {
		form = clientToForm(client);
		editingId = client.id;
		creating = false;
		admin.newSsoClientSecret = null;
	}

	async function saveClient() {
		if (editingId) {
			await admin.updateSsoClient(editingId, {
				name: form.name,
				type: form.type,
				redirectUrls: form.redirectUrls,
				icon: form.icon,
				metadata: form.metadata,
				disabled: form.disabled
			});
			resetForm();
			return;
		}

		await admin.createSsoClient(form);
		creating = false;
		form = { ...defaultForm };
	}

	async function copySecret() {
		if (!admin.newSsoClientSecret) return;
		await navigator.clipboard.writeText(admin.newSsoClientSecret);
		copiedSecret = true;
		setTimeout(() => (copiedSecret = false), 1500);
	}

	function formatDate(date: Date) {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			date
		);
	}
</script>

<div class="flex-1 overflow-auto">
	<div class="flex flex-col gap-5 p-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="text-lg font-semibold text-foreground">SSO Clients</h1>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
					Manage OpenID Connect clients for services hosted on your Ultramarine server.
				</p>
				<p class="mt-2 text-xs text-muted-foreground">
					Issuer URL:
					<code class="border border-border bg-muted/30 px-1.5 py-0.5 text-foreground">
						/api/auth
					</code>
				</p>
			</div>

			<Button
				size="sm"
				class="gap-1.5"
				onclick={startCreate}
				disabled={creating || editingId !== null}
			>
				<Plus class="size-3.5" /> New client
			</Button>
		</div>

		{#if admin.ssoClientError}
			<div
				class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
			>
				<AlertTriangle class="size-4 shrink-0" />{admin.ssoClientError}
			</div>
		{/if}

		{#if admin.newSsoClientSecret}
			<div class="border border-amber-700/60 bg-amber-950/40 p-4">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p class="text-sm font-medium text-amber-200">Copy this client secret now</p>
						<p class="mt-1 text-xs text-amber-100/80">
							For security, the dashboard will not show this secret again.
						</p>
					</div>
					<Button variant="outline" size="sm" class="gap-1.5" onclick={copySecret}>
						{#if copiedSecret}<Check class="size-3.5" /> Copied{:else}<Copy class="size-3.5" /> Copy{/if}
					</Button>
				</div>
				<code
					class="mt-3 block overflow-x-auto border border-amber-700/40 bg-black/30 p-2 text-xs text-amber-100"
				>
					{admin.newSsoClientSecret}
				</code>
			</div>
		{/if}

		{#if creating || editingId}
			<div class="border border-border/60 bg-background/30 p-4">
				<div class="mb-4">
					<h2 class="text-sm font-semibold text-foreground">
						{editingId ? 'Edit SSO client' : 'Create SSO client'}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Use one redirect URL per line. Client secrets are generated automatically.
					</p>
				</div>

				<form
					class="grid gap-4 lg:grid-cols-2"
					onsubmit={(event) => {
						event.preventDefault();
						saveClient();
					}}
				>
					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						Name
						<Input bind:value={form.name} placeholder="Grafana" required />
					</label>

					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						Client ID
						<Input
							bind:value={form.clientId}
							placeholder="Auto-generated"
							disabled={editingId !== null}
						/>
					</label>

					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						Client type
						<select
							bind:value={form.type}
							class="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
						>
							<option value="web">Web</option>
							<option value="public">Public</option>
							<option value="native">Native</option>
							<option value="user-agent-based">User agent based</option>
						</select>
					</label>

					<label class="space-y-1.5 text-xs font-medium text-muted-foreground">
						Icon URL
						<Input bind:value={form.icon} placeholder="https://service.example/icon.svg" />
					</label>

					<label class="space-y-1.5 text-xs font-medium text-muted-foreground lg:col-span-2">
						Redirect URLs
						<textarea
							bind:value={form.redirectUrls}
							class="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
							placeholder="https://grafana.example.com/login/generic_oauth"
							required></textarea>
					</label>

					<label class="space-y-1.5 text-xs font-medium text-muted-foreground lg:col-span-2">
						Metadata JSON
						<textarea
							bind:value={form.metadata}
							class="min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
							placeholder={metadataPlaceholder}></textarea>
					</label>

					<div class="flex items-center gap-2 lg:col-span-2">
						<Switch bind:checked={form.disabled} />
						<span class="text-sm text-foreground">Disabled</span>
					</div>

					<div class="flex items-center justify-end gap-2 lg:col-span-2">
						<Button type="button" variant="outline" onclick={resetForm}>Cancel</Button>
						<Button type="submit" loading={admin.ssoClientSaving[editingId ?? 'create']}>
							{editingId ? 'Save changes' : 'Create client'}
						</Button>
					</div>
				</form>
			</div>
		{/if}

		<div class="overflow-hidden rounded-md border border-border/60">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
					<tr>
						<th class="px-4 py-2 font-medium">Client</th>
						<th class="px-4 py-2 font-medium">Redirect URLs</th>
						<th class="px-4 py-2 font-medium">State</th>
						<th class="px-4 py-2 font-medium">Usage</th>
						<th class="px-4 py-2 text-right font-medium">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border/50">
					{#each sortedClients as client (client.id)}
						<tr>
							<td class="px-4 py-3 align-top">
								<div class="space-y-1">
									<p class="font-medium text-foreground">{client.name}</p>
									<p class="font-mono text-xs text-muted-foreground">{client.clientId}</p>
									<p class="text-[11px] text-muted-foreground">
										Created {formatDate(client.createdAt)}
									</p>
								</div>
							</td>
							<td class="px-4 py-3 align-top">
								<div class="flex max-w-md flex-col gap-1">
									{#each client.redirectUrls as url}
										<code class="text-xs break-all text-muted-foreground">{url}</code>
									{/each}
								</div>
							</td>
							<td class="px-4 py-3 align-top">
								<div class="flex flex-col gap-1 text-xs">
									<span class={client.disabled ? 'text-red-400' : 'text-emerald-400'}>
										{client.disabled ? 'Disabled' : 'Enabled'}
									</span>
									<span class="text-muted-foreground">{client.type}</span>
									<span class="text-muted-foreground">
										Secret {client.clientSecretSet ? 'set' : 'missing'}
									</span>
								</div>
							</td>
							<td class="px-4 py-3 align-top text-xs text-muted-foreground">
								<div>{client.accessTokenCount} token{client.accessTokenCount === 1 ? '' : 's'}</div>
								<div>{client.consentCount} consent{client.consentCount === 1 ? '' : 's'}</div>
							</td>
							<td class="px-4 py-3 align-top">
								<div class="flex justify-end gap-1.5">
									<Button
										variant="outline"
										size="icon-sm"
										onclick={() => startEdit(client)}
										aria-label="Edit client"
									>
										<Pencil class="size-3.5" />
									</Button>
									<Button
										variant="outline"
										size="icon-sm"
										loading={admin.ssoClientSaving[`rotate:${client.id}`]}
										onclick={() => admin.rotateSsoClientSecret(client.id)}
										aria-label="Rotate secret"
									>
										<RefreshCw class="size-3.5" />
									</Button>
									<Button
										variant="destructive"
										size="icon-sm"
										loading={admin.ssoClientSaving[`delete:${client.id}`]}
										onclick={() => {
											if (confirm(`Delete SSO client ${client.name}?`))
												admin.deleteSsoClient(client.id);
										}}
										aria-label="Delete client"
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

		{#if sortedClients.length === 0}
			<div class="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
				No SSO clients yet. Create one to connect services like Grafana, Gitea, or Jellyfin.
			</div>
		{/if}
	</div>
</div>
