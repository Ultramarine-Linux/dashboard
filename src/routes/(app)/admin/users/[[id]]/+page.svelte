<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { AdminState, type AdminPageData } from '$lib/state/admin.svelte';
	import Crown from '~icons/nucleo/crown';
	import Loader2 from '~icons/lucide/loader-2';
	import Shield from '~icons/nucleo/shield';
	import User from '~icons/nucleo/user';

	let { data }: { data: AdminPageData } = $props();
	const admin = new AdminState(untrack(() => data));
	$effect(() => admin.sync(data));

	const sortedUsers = $derived(
		[...admin.adminUsers].sort((a, b) => {
			if (a.isAdmin && !b.isAdmin) return -1;
			if (!a.isAdmin && b.isAdmin) return 1;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		})
	);
</script>

<div class="flex-1 overflow-auto">
	<div class="flex flex-col gap-5 p-5">
		{#if admin.adminUserError}
			<div class="border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400">
				{admin.adminUserError}
			</div>
		{/if}

		<div>
			<h1 class="text-lg font-semibold text-foreground">Users</h1>
			<p class="mt-1 text-sm text-muted-foreground">Manage local dashboard accounts.</p>
		</div>

		<div class="overflow-hidden rounded-md border border-border/60">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
					<tr>
						<th class="px-4 py-2 font-medium">User</th>
						<th class="px-4 py-2 font-medium">Security</th>
						<th class="px-4 py-2 font-medium">Admin</th>
						<th class="px-4 py-2 font-medium">Disabled</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border/50">
					{#each sortedUsers as account (account.id)}
						{@const saving = admin.adminUserSaving[account.id]}
						<tr>
							<td class="px-4 py-3">
								<div class="flex items-center gap-3">
									<div
										class="flex size-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
									>
										{account.name.slice(0, 2).toUpperCase()}
									</div>
									<div>
										<p class="font-medium text-foreground">{account.name}</p>
										<p class="text-xs text-muted-foreground">{account.email}</p>
									</div>
								</div>
							</td>
							<td class="px-4 py-3 text-xs text-muted-foreground">
								<div class="flex flex-col gap-1">
									<span class="inline-flex items-center gap-1">
										<Shield class="size-3" />{account.twoFactorEnabled
											? '2FA enabled'
											: '2FA disabled'}
									</span>
									<span>{account.passkeyCount} passkey{account.passkeyCount === 1 ? '' : 's'}</span>
								</div>
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center gap-2">
									{#if saving}<Loader2 class="size-3 animate-spin" />{/if}
									<Switch
										checked={account.isAdmin}
										disabled={saving}
										onCheckedChange={(checked) => admin.setUserAdmin(account.id, checked)}
									/>
									{#if account.isAdmin}<Crown class="size-3 text-amber-400" />{:else}<User
											class="size-3 text-muted-foreground"
										/>{/if}
								</div>
							</td>
							<td class="px-4 py-3">
								<Switch
									checked={account.disabled}
									disabled={saving}
									onCheckedChange={(checked) => admin.setUserDisabled(account.id, checked)}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if sortedUsers.length === 0}
			<div class="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
				No users found.
			</div>
		{/if}
	</div>
</div>
