<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { acceptInvitation } from '$lib/remote/invitations.remote';
	import { getErrorMessage } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Loader2 from '~icons/lucide/loader-2';
	import { Label } from '$lib/components/ui/label';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const token = $derived(page.params.token);
	let dashboardPassword = $state('');
	let confirmDashboardPassword = $state('');
	let error = $state('');
	let accepting = $state(false);

	async function submit() {
		if (accepting) return;
		if (dashboardPassword !== confirmDashboardPassword) {
			error = 'Dashboard passwords do not match.';
			return;
		}
		if (!token) {
			error = 'Invitation token is missing.';
			return;
		}
		accepting = true;
		error = '';
		try {
			await acceptInvitation({ token, dashboardPassword });
			await goto('/login');
		} catch (err) {
			error = getErrorMessage(err, 'Unable to accept invitation.');
		} finally {
			accepting = false;
		}
	}
</script>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-8">
	<form
		class="w-full max-w-md space-y-5 rounded-md border border-border/60 bg-card p-6"
		onsubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<div>
			<h1 class="text-lg font-semibold text-foreground">Accept invitation</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				You were invited to use {data.invitation.hostName} as {data.invitation.hostUsername}.
			</p>
		</div>
		<div class="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
			<p>{data.invitation.displayName}</p>
			<p class="text-muted-foreground">{data.invitation.email}</p>
		</div>
		<div class="space-y-2">
			<Label for="dashboard-password">Dashboard password</Label><Input
				id="dashboard-password"
				type="password"
				bind:value={dashboardPassword}
				required
			/>
			<p class="text-xs text-muted-foreground">Used to sign in to Ultramarine Dashboard.</p>
		</div>
		<div class="space-y-2">
			<Label for="dashboard-confirm">Confirm dashboard password</Label><Input
				id="dashboard-confirm"
				type="password"
				bind:value={confirmDashboardPassword}
				required
			/>
		</div>
		<div class="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
			Host password setup is intentionally deferred until the elevated Tetra user-management path is
			enabled. Your dashboard password is created independently and will not be reused for the host
			account.
		</div>
		{#if error}<p
				class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
			>
				{error}
			</p>{/if}
		<Button type="submit" class="w-full" disabled={accepting}>
			{#if accepting}<Loader2 class="size-4 animate-spin" />{/if}Finish dashboard setup
		</Button>
	</form>
</main>
