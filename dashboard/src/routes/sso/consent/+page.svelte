<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const scopeLabels: Record<string, string> = {
		openid: 'Confirm your identity',
		profile: 'Read your profile name and avatar',
		email: 'Read your email address',
		groups: 'Read your Ultramarine role/group',
		offline_access: 'Stay signed in with refresh tokens'
	};
</script>

<svelte:head>
	<title>{pageTitle('Authorize SSO')}</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4">
	<div class="w-full max-w-sm space-y-6 border border-border bg-card p-6 shadow-sm">
		<div class="flex items-center justify-center gap-2">
			<img src={dashboardBrand.logo} alt={dashboardBrand.name} class="h-5 w-5" />
			<span class="text-base font-semibold tracking-tight text-foreground"
				>{dashboardBrand.name}</span
			>
		</div>

		<div class="space-y-2 text-center">
			<h1 class="text-lg font-medium text-foreground">Authorize SSO access</h1>
			<p class="text-sm text-muted-foreground">
				Allow <span class="font-medium text-foreground">{data.clientId}</span> to use your Ultramarine
				Server account for sign-in.
			</p>
		</div>

		{#if form?.error}
			<div class="border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400">
				{form.error}
			</div>
		{/if}

		<div class="space-y-2">
			<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				Requested access
			</p>
			<ul class="space-y-2 text-sm text-foreground">
				{#each data.scopes as scope}
					<li class="flex items-center justify-between border border-border px-3 py-2">
						<span>{scopeLabels[scope] ?? scope}</span>
						<span class="text-xs text-muted-foreground">{scope}</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<form method="POST" action="?/consent">
				<input type="hidden" name="consentCode" value={data.consentCode} />
				<input type="hidden" name="accept" value="false" />
				<Button type="submit" variant="outline" class="w-full">Deny</Button>
			</form>
			<form method="POST" action="?/consent">
				<input type="hidden" name="consentCode" value={data.consentCode} />
				<input type="hidden" name="accept" value="true" />
				<Button type="submit" class="w-full">Allow</Button>
			</form>
		</div>
	</div>
</main>
