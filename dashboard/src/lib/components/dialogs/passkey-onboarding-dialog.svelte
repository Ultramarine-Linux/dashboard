<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { beginPasskeyRegistration, finishPasskeyRegistration } from '$lib/remote/account.remote';
	import { getErrorMessage } from '$lib/utils';
	import { attestationToJson, creationOptionsFromJson, webAuthnErrorMessage } from '$lib/webauthn';
	import Loader2 from '~icons/lucide/loader-2';
	import Fingerprint from '~icons/nucleo/fingerprint';

	type Props = {
		open?: boolean;
		/** The hostname passkeys are tied to. */
		hostname: string | null;
		onComplete?: () => void;
	};

	let { open = $bindable(false), hostname, onComplete }: Props = $props();

	let passkeyName = $state('');
	let registering = $state(false);
	let error = $state('');

	$effect(() => {
		if (!open) {
			passkeyName = '';
			error = '';
			registering = false;
		}
	});

	async function registerPasskey() {
		if (registering) return;
		registering = true;
		error = '';
		try {
			const name = passkeyName.trim();
			const { options } = await beginPasskeyRegistration({ name });
			const credential = (await navigator.credentials.create(
				creationOptionsFromJson(options)
			)) as PublicKeyCredential | null;
			if (!credential) {
				error = 'No passkey was created.';
				return;
			}
			await finishPasskeyRegistration({
				name,
				credentialJson: JSON.stringify(attestationToJson(credential))
			});
			open = false;
			onComplete?.();
		} catch (err) {
			error =
				err instanceof DOMException
					? webAuthnErrorMessage(err, 'Failed to register passkey.')
					: getErrorMessage(err, 'Failed to register passkey.');
		} finally {
			registering = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="border-border bg-background sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Add passkey</Dialog.Title>
			<Dialog.Description>
				Sign in without a password or code. Your browser will ask you to confirm.
				{#if hostname}
					The passkey works only at <span class="font-medium text-foreground">{hostname}</span>.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-4">
			<div class="flex flex-col gap-1.5">
				<Label for="passkey-name">Name</Label>
				<Input
					id="passkey-name"
					bind:value={passkeyName}
					placeholder="My laptop"
					onkeydown={(e) => e.key === 'Enter' && registerPasskey()}
				/>
			</div>

			{#if error}
				<p class="text-xs text-red-400">{error}</p>
			{/if}

			<Button onclick={registerPasskey} disabled={registering} class="gap-1.5">
				{#if registering}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
					Registering...
				{:else}
					<Fingerprint class="size-4" />
					Register passkey
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
