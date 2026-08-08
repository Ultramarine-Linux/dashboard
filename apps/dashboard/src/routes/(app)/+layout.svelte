<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import UserSettingsDialog from '$lib/components/dialogs/user-settings-dialog.svelte';
	import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
	import {
		clearUserSettingsHref,
		UserSettingsState,
		type UserSettingsTab
	} from '$lib/state/user-settings.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Command from '$lib/components/ui/command';
	import * as Sheet from '$lib/components/ui/sheet';
	import { authClient } from '$lib/auth-client';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import type { FeatureFlags } from '$lib/feature-flags';
	import type { IconComponent } from '$lib';
	import ArrowRight from '~icons/lucide/arrow-right';
	import Check from '~icons/lucide/check';
	import Key from '~icons/nucleo/key';
	import Menu from '~icons/lucide/menu';
	import Search from '~icons/nucleo/search';
	import Server from '~icons/nucleo/server';
	import Settings from '~icons/nucleo/settings';
	import User from '~icons/nucleo/user';

	let { children, data } = $props();
	let mobileNavOpen = $state(false);
	let commandOpen = $state(false);
	let commandSearch = $state('');
	const featureFlags = $derived((data.featureFlags ?? {}) as FeatureFlags);

	const navItems = $derived.by(() => {
		const items: { icon: IconComponent; label: string; href: string }[] = [];
		if (featureFlags.managedHosts) items.push({ icon: Server, label: 'Hosts', href: '/hosts' });
		return items;
	});

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	const userSettings = new UserSettingsState();
	let profileName = $state('');

	const user = $derived(data.user);
	$effect(() => {
		profileName = user?.name ?? '';
	});

	function openUserSettings(tab: UserSettingsTab = 'profile') {
		userSettings.show(tab);
	}

	$effect(() => {
		const url = page.url;
		if (userSettings.urlHasSettingsTab(url)) {
			userSettings.syncFromUrl(url);
			void goto(clearUserSettingsHref(url), {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		}
	});

	const normalizedCommandSearch = $derived(commandSearch.trim().toLowerCase());
	type CommandEntry = {
		icon: IconComponent;
		label: string;
		href?: string;
		action?: () => void | Promise<void>;
	};
	const navigateCommands = $derived.by(() => {
		const commands: CommandEntry[] = [];
		if (featureFlags.managedHosts) commands.push({ icon: Server, label: 'Hosts', href: '/hosts' });
		return commands;
	});
	const accountCommands: CommandEntry[] = [
		{ icon: User, label: 'Profile', action: () => openUserSettings('profile') },
		{ icon: Key, label: 'SSH Keys', action: () => openUserSettings('keys') },
		{ icon: Key, label: 'API Tokens', action: () => openUserSettings('api') },
		{ icon: Key, label: 'Change Password', action: () => openUserSettings('security') }
	];

	function matchesCommandSearch(values: (string | null | undefined)[]) {
		if (!normalizedCommandSearch) return true;
		return values.some((value) => value?.toLowerCase().includes(normalizedCommandSearch));
	}

	const filteredNavigateCommands = $derived.by(() =>
		navigateCommands.filter((command) => matchesCommandSearch([command.label]))
	);
	const filteredAccountCommands = $derived.by(() =>
		accountCommands.filter((command) => matchesCommandSearch([command.label]))
	);

	function openCommandPalette() {
		commandSearch = '';
		commandOpen = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			commandOpen = !commandOpen;
			if (commandOpen) commandSearch = '';
		}
	}

	function runCommand(command: CommandEntry) {
		commandOpen = false;
		if (command.href) void goto(command.href as any);
		else void command.action?.();
	}
</script>

<Toaster position="top-center" />
<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{pageTitle('Dashboard')}</title>
</svelte:head>

{#if !data.user}
	{@render children()}
{:else}
	<div class="flex h-screen flex-col overflow-hidden bg-background">
		<header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
			<div class="flex min-w-0 items-center gap-2">
				{#if navItems.length > 0}
					<button
						class="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground lg:hidden"
						type="button"
						onclick={() => (mobileNavOpen = true)}
						aria-label="Open navigation"
					>
						<Menu class="h-4 w-4" />
					</button>
				{/if}
				<a href="/hosts" class="flex shrink-0 items-center gap-2">
					<img src={dashboardBrand.logo} alt="" class="h-5 w-5" />
					<span class="text-sm font-semibold tracking-tight text-foreground"
						>{dashboardBrand.name}</span
					>
				</a>
			</div>

			<div class="flex min-w-0 flex-1 items-center justify-end gap-3">
				{#if data.isAdmin}
					<a
						href="/admin"
						class="hidden items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
					>
						<Settings class="size-4" />
						<span>Admin</span>
					</a>
				{/if}
				<button
					class="hidden items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
					type="button"
					onclick={openCommandPalette}
				>
					<Search class="h-3 w-3" />
					<span>Search</span>
					<kbd class="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">⌘K</kbd>
				</button>
				<button class="flex items-center gap-2" type="button" onclick={() => openUserSettings()}>
					<div class="hidden min-w-0 text-right sm:block">
						<p class="truncate text-sm leading-tight font-medium text-foreground">
							{profileName || user?.email}
						</p>
						<p class="truncate text-xs leading-tight text-muted-foreground">{user?.email}</p>
					</div>
					<Avatar.Root class="h-8 w-8 shrink-0 border border-border">
						<Avatar.Fallback class="bg-muted text-xs text-foreground">
							{(profileName || user?.email || '?').slice(0, 2).toUpperCase()}
						</Avatar.Fallback>
					</Avatar.Root>
				</button>
			</div>
		</header>

		<div class="flex flex-1 overflow-hidden">
			{#if navItems.length > 0}
				<aside class="hidden w-12 shrink-0 border-r border-border bg-background lg:block">
					<nav class="flex flex-col items-center gap-1 p-2">
						{#each navItems as item (item.label)}
							<a
								class="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground {isActive(
									item.href
								)
									? 'bg-muted text-foreground'
									: ''}"
								href={item.href}
								aria-label={item.label}
							>
								<item.icon class="h-4 w-4" />
							</a>
						{/each}
					</nav>
				</aside>
			{/if}
			<main class="flex flex-1 overflow-hidden">
				{@render children()}
			</main>
		</div>
	</div>

	<Sheet.Root bind:open={mobileNavOpen}>
		<Sheet.Content side="left" class="flex w-64 flex-col gap-0 border-border bg-background p-0">
			<Sheet.Header class="border-b border-border px-4 py-3 text-left">
				<Sheet.Title class="truncate text-sm text-foreground">{dashboardBrand.name}</Sheet.Title>
			</Sheet.Header>
			<nav class="flex flex-col p-2">
				{#each navItems as item (item.label)}
					<a
						class="flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground {isActive(
							item.href
						)
							? 'bg-muted text-foreground'
							: ''}"
						href={item.href}
						onclick={() => (mobileNavOpen = false)}
					>
						<item.icon class="h-4 w-4 shrink-0" />
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>
		</Sheet.Content>
	</Sheet.Root>

	<UserSettingsDialog
		bind:open={userSettings.open}
		bind:activeTab={userSettings.tab}
		bind:profileName
		{user}
	/>
	<ConfirmDialog />

	<Command.Dialog bind:open={commandOpen}>
		<Command.Input bind:value={commandSearch} placeholder="Search dashboard..." />
		<Command.List class="max-h-[350px] bg-background">
			<Command.Empty>No results found.</Command.Empty>
			{#if filteredNavigateCommands.length > 0}
				<Command.Group heading="Navigate">
					{#each filteredNavigateCommands as command (command.label)}
						<Command.Item value={command.label} class="gap-2" onSelect={() => runCommand(command)}>
							<command.icon class="h-3.5 w-3.5 text-muted-foreground" />
							<span>{command.label}</span>
							<Command.Shortcut><ArrowRight class="h-3 w-3" /></Command.Shortcut>
						</Command.Item>
					{/each}
				</Command.Group>
				<Command.Separator class="bg-muted" />
			{/if}
			{#if filteredAccountCommands.length > 0}
				<Command.Group heading="Account">
					{#each filteredAccountCommands as command (command.label)}
						<Command.Item value={command.label} class="gap-2" onSelect={() => runCommand(command)}>
							<command.icon class="h-3.5 w-3.5 text-muted-foreground" />
							<span>{command.label}</span>
						</Command.Item>
					{/each}
				</Command.Group>
			{/if}
		</Command.List>
	</Command.Dialog>
{/if}
