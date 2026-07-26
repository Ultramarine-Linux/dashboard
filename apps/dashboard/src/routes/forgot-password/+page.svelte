<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { authClient } from '$lib/auth-client';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import Loader2 from '~icons/lucide/loader-2';
	import AlertCircle from '~icons/nucleo/alert-circle';
	import CheckCircle2 from '~icons/nucleo/check-circle';

	let email = $state('');
	let error = $state('');
	let loading = $state(false);
	let sent = $state(false);

	async function handleSubmit() {
		if (!email) return;
		error = '';
		loading = true;

		const { error: requestError } = await authClient.requestPasswordReset({
			email,
			redirectTo: '/reset-password'
		});

		loading = false;
		if (requestError) {
			error = requestError.message ?? 'Unable to send reset email.';
			return;
		}
		sent = true;
	}
</script>

<svelte:head>
	<title>{pageTitle('Reset your password')}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4">
	<div class="w-full max-w-xs">
		<div class="mb-10 flex items-center justify-center gap-2">
			<img src={dashboardBrand.logo} alt={dashboardBrand.name} class="h-5 w-5" />
			<span class="text-base font-semibold tracking-tight text-foreground"
				>{dashboardBrand.name}</span
			>
		</div>

		<div class="space-y-5">
			<h1 class="text-center text-lg font-medium text-foreground">Reset your password</h1>
			{#if sent}
				<div
					class="flex items-center gap-2 border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
				>
					<CheckCircle2 class="size-4 shrink-0 text-primary" />
					If an account exists for {email}, we&apos;ve sent a reset link.
				</div>
			{:else}
				<p class="text-center text-xs text-muted-foreground">
					Enter your email and we&apos;ll send you a link to reset your password.
				</p>
				{#if error}
					<div
						class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
					>
						<AlertCircle class="size-4 shrink-0" />{error}
					</div>
				{/if}
				<form
					class="space-y-3"
					onsubmit={(event) => {
						event.preventDefault();
						handleSubmit();
					}}
				>
					<Input type="email" bind:value={email} placeholder="Email" aria-label="Email" required />
					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}Send reset link{/if}
					</Button>
				</form>
			{/if}
			<p class="text-center text-xs text-muted-foreground">
				Remembered it? <a href="/login" class="underline underline-offset-2 hover:text-foreground"
					>Back to sign in</a
				>
			</p>
		</div>
	</div>
</main>
