<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Loader2 from '~icons/lucide/loader-2';
	import AlertCircle from '~icons/nucleo/alert-circle';
	import Eye from '~icons/nucleo/eye';
	import EyeOff from '~icons/nucleo/eye-off';
	import Fingerprint from '~icons/nucleo/fingerprint';
	import ShieldCheck from '~icons/nucleo/shield-check';
	import type { ActionData, PageData } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import {
		assertionToJson,
		passkeysSupported,
		requestOptionsFromJson,
		webAuthnErrorMessage
	} from '$lib/webauthn';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showPassword = $state(false);
	let loading = $state(false);
	let passkeyLoading = $state(false);
	let passkeyError = $state('');
	let useRecoveryCode = $state(false);
	let browserSupportsPasskeys = $state(false);

	$effect(() => {
		browserSupportsPasskeys = passkeysSupported();
	});

	const error = $derived(passkeyError || (form && 'error' in form ? form.error : ''));
	const username = $derived(form && 'username' in form ? (form.username as string) : '');

	const submit: SubmitFunction = () => {
		loading = true;
		passkeyError = '';
		return async ({ update }) => {
			await update();
			loading = false;
		};
	};

	async function postAction(action: string, body: FormData) {
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	}

	async function signInWithPasskey() {
		if (passkeyLoading) return;
		passkeyError = '';
		passkeyLoading = true;
		try {
			const begin = await postAction('passkeyBegin', new FormData());
			if (begin.type !== 'success' || !begin.data?.options) {
				passkeyError =
					(begin.type === 'failure' && (begin.data?.error as string)) ||
					'Unable to start passkey sign-in.';
				return;
			}

			const credential = (await navigator.credentials.get(
				requestOptionsFromJson(begin.data.options as Parameters<typeof requestOptionsFromJson>[0])
			)) as PublicKeyCredential | null;
			if (!credential) {
				passkeyError = 'No passkey was selected.';
				return;
			}

			const body = new FormData();
			body.set('credential', JSON.stringify(assertionToJson(credential)));
			body.set('redirectTo', data.redirectTo);
			const result = await postAction('passkeyFinish', body);
			if (result.type === 'redirect') {
				await goto(result.location, { invalidateAll: true });
				return;
			}
			passkeyError =
				(result.type === 'failure' && (result.data?.error as string)) ||
				'Unable to sign in with passkey.';
		} catch (err) {
			passkeyError = webAuthnErrorMessage(err, 'Unable to sign in with passkey.');
		} finally {
			passkeyLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Sign in')}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4">
	<div class="w-full max-w-xs">
		<div class="mb-10 flex items-center justify-center gap-2">
			<img src={dashboardBrand.logo} alt={dashboardBrand.name} class="h-5 w-5" />
			<span class="text-base font-semibold tracking-tight text-foreground">
				{dashboardBrand.name}
			</span>
		</div>

		<div class="space-y-5">
			{#if !data.tetraReachable}
				<div
					class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
				>
					<AlertCircle class="size-4 shrink-0" />
					Dashboard cannot reach Tetra on this server.
				</div>
			{:else if data.setupRequired}
				<p class="border border-border px-3 py-2 text-sm text-muted-foreground">
					This server has not finished first-time setup. Complete setup with the code shown on the
					server's console, then sign in here.
				</p>
			{/if}

			{#if error}
				<div
					role="alert"
					class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
				>
					<AlertCircle class="size-4 shrink-0" />
					{error}
				</div>
			{/if}

			{#if data.secondFactor}
				<div class="flex flex-col items-center gap-3">
					<div
						class="flex h-12 w-12 items-center justify-center border border-border bg-background"
					>
						<ShieldCheck class="h-5 w-5 text-primary" />
					</div>
					<h1 class="text-lg font-medium text-foreground">Two-factor authentication</h1>
					<p class="text-center text-sm text-muted-foreground">
						{useRecoveryCode
							? 'Enter one of your recovery codes. Each code works once.'
							: 'Enter the code from your authenticator app.'}
					</p>
				</div>

				<form method="POST" action="?/secondFactor" use:enhance={submit} class="space-y-3">
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<input type="hidden" name="method" value={useRecoveryCode ? 'recovery_code' : 'totp'} />
					{#if useRecoveryCode}
						<Input
							name="code"
							placeholder="xxxxx-xxxxx"
							aria-label="Recovery code"
							class="text-center font-mono"
							autocomplete="off"
							required
						/>
					{:else}
						<Input
							name="code"
							placeholder="000000"
							aria-label="Authentication code"
							class="text-center font-mono tracking-widest"
							autocomplete="one-time-code"
							inputmode="numeric"
							pattern="[0-9 ]*"
							maxlength={7}
							required
						/>
					{/if}

					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{:else}
							Verify
						{/if}
					</Button>
				</form>

				<div class="flex items-center justify-between text-xs">
					{#if data.secondFactor.methods.includes('recovery_code')}
						<button
							type="button"
							class="text-muted-foreground underline underline-offset-2 hover:text-foreground"
							onclick={() => (useRecoveryCode = !useRecoveryCode)}
						>
							{useRecoveryCode ? 'Use authenticator app' : 'Use a recovery code'}
						</button>
					{/if}
					<form method="POST" action="?/cancel" use:enhance>
						<button
							type="submit"
							class="text-muted-foreground underline underline-offset-2 hover:text-foreground"
						>
							Start over
						</button>
					</form>
				</div>
			{:else}
				<h1 class="text-center text-lg font-medium text-foreground">Sign in</h1>

				<form method="POST" action="?/password" use:enhance={submit} class="space-y-3">
					<input type="hidden" name="redirectTo" value={data.redirectTo} />
					<Input
						name="username"
						value={username}
						placeholder="Username"
						aria-label="Username"
						autocomplete="username"
						autocapitalize="none"
						spellcheck={false}
						required
					/>

					<div class="relative">
						<Input
							name="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="Password"
							aria-label="Password"
							autocomplete="current-password"
							class="pr-10"
							required
						/>
						<button
							type="button"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							class="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
							onclick={() => (showPassword = !showPassword)}
						>
							{#if showPassword}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}
						</button>
					</div>

					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{:else}
							Sign in
						{/if}
					</Button>
				</form>

				{#if data.passkeysAvailable && browserSupportsPasskeys}
					<div class="flex items-center gap-2">
						<div class="h-px flex-1 bg-muted"></div>
						<span class="text-[10px] text-muted-foreground">or</span>
						<div class="h-px flex-1 bg-muted"></div>
					</div>

					<Button
						variant="outline"
						size="sm"
						class="w-full gap-1.5"
						disabled={passkeyLoading}
						onclick={signInWithPasskey}
					>
						{#if passkeyLoading}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{:else}
							<Fingerprint class="size-4" />
							Sign in with passkey
						{/if}
					</Button>
				{/if}

				<p class="text-center text-xs text-muted-foreground">
					Sign in with your account on this server.
				</p>
			{/if}
		</div>
	</div>
</main>
