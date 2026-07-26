<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { featureFlagKeys } from '$lib/feature-flags';
	import { AdminState, type AdminLayoutData } from '$lib/state/admin.svelte';
	import Flag from '~icons/nucleo/flag';
	import Key from '~icons/nucleo/key';
	import UserCog from '~icons/nucleo/user-cog';

	let { data, children }: { data: AdminLayoutData; children: Snippet } = $props();
	const admin = new AdminState(untrack(() => data));
	$effect(() => admin.sync(data));

	const tabs = $derived([
		{ href: '/admin/users', label: 'Users', icon: UserCog, count: admin.adminCounts.users },
		{ href: '/admin/sso', label: 'SSO', icon: Key, count: admin.adminCounts.ssoClients },
		{
			href: '/admin/features',
			label: 'Feature Flags',
			icon: Flag,
			count: featureFlagKeys.filter((key) => admin.featureFlags[key]).length
		}
	]);
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<div class="flex h-10 shrink-0 items-center gap-0 overflow-x-auto border-b border-border">
		{#each tabs as tab (tab.href)}
			{@const active =
				page.url.pathname === tab.href || page.url.pathname.startsWith(`${tab.href}/`)}
			<a
				class="flex h-full items-center gap-1.5 border-b-2 px-5 text-xs font-medium transition-colors {active
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
				href={tab.href}
			>
				<tab.icon class="size-4 shrink-0" />
				{tab.label}
				<Badge variant="secondary" class="text-[10px]">{tab.count}</Badge>
			</a>
		{/each}
	</div>
	{@render children()}
</div>
