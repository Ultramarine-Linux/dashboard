<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { authClient } from '$lib/auth-client';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import Loader2 from '~icons/lucide/loader-2';
	import AlertCircle from '~icons/nucleo/alert-circle';
	import Eye from '~icons/nucleo/eye';
	import EyeOff from '~icons/nucleo/eye-off';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		if (!password || !confirmPassword || !data.token) return;
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}
		error = '';
		loading = true;
		const { error: resetError } = await authClient.resetPassword({
			newPassword: password,
			token: data.token
		});
		if (resetError) {
			error = resetError.message ?? 'Unable to reset password.';
			loading = false;
			return;
		}
		await goto('/login');
	}
</script>

<svelte:head>
	<title>{pageTitle('Choose a new password')}</title>
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
			<h1 class="text-center text-lg font-medium text-foreground">Choose a new password</h1>
			{#if data.invalidToken}
				<div
					class="flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
				>
					<AlertCircle class="size-4 shrink-0" />This reset link is invalid or has expired.
				</div>
				<p class="text-center text-xs text-muted-foreground">
					<a href="/forgot-password" class="underline underline-offset-2 hover:text-foreground"
						>Request a new reset link</a
					>
				</p>
			{:else}
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
					<div class="relative">
						<Input
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							placeholder="New password"
							aria-label="New password"
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
					<Input
						type={showPassword ? 'text' : 'password'}
						bind:value={confirmPassword}
						placeholder="Confirm new password"
						aria-label="Confirm new password"
						required
					/>
					<Button type="submit" class="w-full" disabled={loading}
						>{#if loading}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}Reset password{/if}</Button
					>
				</form>
			{/if}
		</div>
	</div>
</main>
