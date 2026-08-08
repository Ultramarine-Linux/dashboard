<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { createManagedHost, enrollManagedHost } from '$lib/remote/managed-hosts.remote';
	import { getErrorMessage } from '$lib/utils';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import Server from '~icons/nucleo/server';

	let displayName = $state('');
	let managementTarget = $state<'local' | 'remote'>('local');
	let agentUrl = $state('wss://tetra:7780');
	let bearerToken = $state('');
	let useWebSocket = $state(true);
	let enrollmentToken = $state('');
	let tlsCaCertificate = $state('');
	let actionError = $state('');
	let creating = $state(false);

	async function createHost() {
		if (creating) return;
		actionError = '';
		creating = true;

		try {
			const host = await createManagedHost({
				displayName,
				agentUrl,
				bearerToken: useWebSocket ? '' : bearerToken.trim()
			});
			if (useWebSocket) {
				await enrollManagedHost({
					hostId: host.id,
					enrollmentToken,
					tlsCaCertificate: tlsCaCertificate.trim()
				});
			}
			displayName = '';
			bearerToken = '';
			enrollmentToken = '';
			tlsCaCertificate = '';
			await invalidate('hosts:managed-hosts');
			await goto(`/hosts/${host.id}`);
		} catch (err) {
			actionError = getErrorMessage(err, 'Failed to register managed host.');
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col overflow-auto bg-background">
	<div class="border-b border-border px-5 py-4">
		<div class="flex items-center gap-2">
			<Server class="size-4 text-muted-foreground" />
			<h1 class="text-base font-semibold text-foreground">Register Host</h1>
		</div>
		<p class="mt-1 text-xs text-muted-foreground">
			Register a Tetra agent to inspect host capabilities and dispatch commands.
		</p>
	</div>

	<div class="flex flex-1 items-start justify-center p-6 sm:p-8">
		<form
			class="w-full max-w-md space-y-5"
			onsubmit={(event) => {
				event.preventDefault();
				createHost();
			}}
		>
			<div class="space-y-2">
				<Label for="host-name">Name</Label>
				<Input id="host-name" bind:value={displayName} placeholder="fedora-server" />
			</div>

			<div class="space-y-2">
				<Label for="agent-url">Agent URL</Label>
				<Input
					id="agent-url"
					bind:value={agentUrl}
					placeholder={useWebSocket ? 'wss://tetra:7780' : 'http://127.0.0.1:7777'}
				/>
				<p class="text-xs text-muted-foreground">
					{managementTarget === 'local'
						? 'The local integration stack uses the authenticated Tetra WebSocket listener.'
						: 'Enter the address and trust material for a remote Tetra host.'}
				</p>
			</div>

			<div class="space-y-2">
				<Label>Management target</Label>
				<div class="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant={managementTarget === 'local' ? 'default' : 'outline'}
						onclick={() => {
							managementTarget = 'local';
							useWebSocket = true;
							agentUrl = 'wss://tetra:7780';
						}}>Local host</Button
					>
					<Button
						type="button"
						variant={managementTarget === 'remote' ? 'default' : 'outline'}
						onclick={() => {
							managementTarget = 'remote';
							useWebSocket = true;
							agentUrl = '';
						}}>Remote host</Button
					>
				</div>
				<p class="text-xs text-muted-foreground">
					Local is selected by default for the Dashboard/Tetra development stack.
				</p>
			</div>

			<div class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
				<div>
					<Label for="use-websocket">Use authenticated WebSocket</Label>
					<p class="mt-1 text-xs text-muted-foreground">
						Uses Ed25519 enrollment instead of a bearer token. Required for local and remote Tetra
						hosts.
					</p>
				</div>
				<Switch
					id="use-websocket"
					checked={useWebSocket}
					onCheckedChange={(checked) => {
						useWebSocket = checked;
						if (checked && /^https?:\/\/127\.0\.0\.1(?::\d+)?/.test(agentUrl)) {
							agentUrl = 'wss://tetra:7780';
						} else if (!checked && /^wss:\/\/tetra:7780$/.test(agentUrl)) {
							agentUrl = 'http://127.0.0.1:7777';
						}
					}}
				/>
			</div>

			{#if useWebSocket}
				<div class="space-y-2">
					<Label for="enrollment-token">One-time enrollment token</Label>
					<Input id="enrollment-token" type="password" bind:value={enrollmentToken} />
				</div>
				<div class="space-y-2">
					<Label for="tls-ca-certificate">Private CA certificate</Label>
					<textarea
						id="tls-ca-certificate"
						bind:value={tlsCaCertificate}
						rows="5"
						class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm"
						placeholder="-----BEGIN CERTIFICATE-----"></textarea>
					<p class="text-xs text-muted-foreground">
						Paste the CA PEM when the host uses a private certificate authority, such as
						`dev/certs/ca.crt` for local development.
					</p>
				</div>
			{:else}
				<div class="space-y-2">
					<Label for="bearer-token">Bearer token</Label>
					<Input
						id="bearer-token"
						type="password"
						bind:value={bearerToken}
						placeholder="Optional"
					/>
				</div>
			{/if}

			{#if actionError}
				<p class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
					{actionError}
				</p>
			{/if}

			<Button
				type="submit"
				class="w-full gap-2"
				disabled={creating || !displayName.trim() || (useWebSocket && !enrollmentToken.trim())}
			>
				{#if creating}
					<Loader2 class="size-4 animate-spin" />
				{:else}
					<Plus class="size-4" />
				{/if}
				Register Host
			</Button>
		</form>
	</div>
</div>
