<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import { t, type TranslationKey } from '$lib/i18n';
	import type { FeatureFlags } from '$lib/feature-flags';
	import type { IconComponent } from '$lib';
	import {
		hostTabGroups,
		hostTabHref,
		visibleHostTabs,
		type HostTabHref
	} from '$lib/hosts/host-detail';
	import ArrowRight from '~icons/lucide/arrow-right';
	import ChevronRight from '~icons/lucide/chevron-right';
	import Loader2 from '~icons/lucide/loader-2';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import Flag from '~icons/nucleo/flag';
	import AlertTriangle from '~icons/nucleo/alert-triangle';
	import Key from '~icons/nucleo/key';
	import Lock from '~icons/nucleo/lock';
	import Menu from '~icons/lucide/menu';
	import Search from '~icons/nucleo/search';
	import Settings from '~icons/nucleo/settings';
	import User from '~icons/nucleo/user';

	let { children, data } = $props();
	let mobileNavOpen = $state(false);
	let commandOpen = $state(false);
	let commandSearch = $state('');
	const featureFlags = $derived((data.featureFlags ?? {}) as FeatureFlags);

	type NavHref = HostTabHref | '/admin/sso' | '/admin/features';
	type NavItem = { icon: IconComponent; label: string; href: NavHref };
	type NavGroup = { label: string; items: NavItem[] };

	const hostTabsForUser = $derived(visibleHostTabs(data.permissions, featureFlags));

	const adminItems: { icon: IconComponent; labelKey: TranslationKey; href: NavHref }[] = [
		{ icon: Key, labelKey: 'nav.sso', href: '/admin/sso' },
		{ icon: Flag, labelKey: 'nav.features', href: '/admin/features' }
	];

	const navGroups = $derived.by<NavGroup[]>(() => {
		const groups: NavGroup[] = hostTabGroups
			.map((group) => ({
				label: t(group.labelKey),
				items: hostTabsForUser
					.filter((tab) => tab.group === group.id)
					.map((tab) => ({ icon: tab.icon, label: t(tab.labelKey), href: hostTabHref(tab.id) }))
			}))
			.filter((group) => group.items.length > 0);
		if (data.isAdmin)
			groups.push({
				label: t('nav.administration'),
				items: adminItems.map(({ labelKey, ...item }) => ({ ...item, label: t(labelKey) }))
			});
		return groups;
	});

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	const activeNav = $derived.by(() => {
		for (const group of navGroups) {
			const item = group.items.find((entry) => isActive(entry.href));
			if (item) return { group: group.label, item };
		}
		return null;
	});

	// Loaded best-effort by the shell, so it is available on every page.
	const host = $derived(data.host);
	let refreshingHost = $state(false);

	async function refreshHost() {
		if (refreshingHost) return;
		refreshingHost = true;
		try {
			await invalidate('app:local-host');
		} finally {
			refreshingHost = false;
		}
	}

	const userSettings = new UserSettingsState();

	const user = $derived(data.user);

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
		href?: NavHref;
		action?: () => void | Promise<void>;
	};
	const navigateCommands = $derived.by(() =>
		navGroups.flatMap((group) =>
			group.items.map((item): CommandEntry => ({
				icon: item.icon,
				label: item.label,
				href: item.href
			}))
		)
	);
	const accountCommands = $derived<CommandEntry[]>([
		{ icon: User, label: t('settings.tabs.profile'), action: () => openUserSettings('profile') },
		{ icon: Key, label: t('settings.tabs.keys'), action: () => openUserSettings('keys') },
		{ icon: Key, label: t('settings.tabs.api'), action: () => openUserSettings('api') },
		{ icon: Lock, label: t('settings.tabs.security'), action: () => openUserSettings('security') }
	]);

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
		if (command.href) void goto(resolve(command.href));
		else void command.action?.();
	}
</script>

<Toaster position="top-center" />
<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{pageTitle(activeNav?.item.label ?? t('shell.dashboard'))}</title>
</svelte:head>

{#snippet sidebarNav(onNavigate?: () => void)}
	<nav class="flex flex-col gap-5 px-3 py-4" aria-label={t('shell.mainNav')}>
		{#each navGroups as group (group.label)}
			<div class="flex flex-col gap-0.5">
				<p
					class="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
				>
					{group.label}
				</p>
				{#each group.items as item (item.href)}
					{@const active = isActive(item.href)}
					<a
						href={resolve(item.href)}
						aria-current={active ? 'page' : undefined}
						onclick={() => onNavigate?.()}
						class="group/nav relative flex h-8 items-center gap-2.5 px-2 text-sm transition-colors {active
							? 'bg-primary/10 font-medium text-foreground high-contrast:bg-foreground high-contrast:text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						{#if active}
							<span class="absolute inset-y-0 -left-3 w-0.5 bg-primary" aria-hidden="true"></span>
						{/if}
						<item.icon
							class="size-4 shrink-0 {active
								? 'text-primary high-contrast:text-background'
								: 'text-muted-foreground group-hover/nav:text-foreground'}"
						/>
						<span class="truncate">{item.label}</span>
					</a>
				{/each}
			</div>
		{/each}
	</nav>
{/snippet}

{#snippet hostCard()}
	{#if host}
		<div class="mx-3 mt-3 flex items-center gap-2.5 border border-border bg-background px-3 py-2.5">
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-foreground">
					{host.hostname ?? t('shell.thisServer')}
				</p>
				{#if host.os}
					<p class="truncate text-xs text-muted-foreground">{host.os}</p>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet userButton()}
	<button
		class="flex w-full items-center gap-2.5 p-2 text-left transition-colors hover:bg-muted"
		type="button"
		onclick={() => openUserSettings()}
	>
		<Avatar.Root class="size-8 shrink-0 border border-border">
			<Avatar.Fallback class="bg-primary/15 text-xs font-medium text-foreground">
				{(user?.username || '?').slice(0, 2).toUpperCase()}
			</Avatar.Fallback>
		</Avatar.Root>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm leading-tight font-medium text-foreground">{user?.username}</p>
			<p class="truncate text-xs leading-tight text-muted-foreground">
				{user?.admin ? t('shell.role.admin') : t('shell.role.user')}
			</p>
		</div>
		<Settings class="size-4 shrink-0 text-muted-foreground" />
		<span class="sr-only">{t('shell.openAccountSettings')}</span>
	</button>
{/snippet}

{#if !data.user}
	{@render children()}
{:else}
	<div class="flex h-screen overflow-hidden bg-background">
		<aside
			class="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
			aria-label={t('shell.sidebar')}
		>
			<a href={resolve('/')} class="flex h-14 shrink-0 items-center gap-2.5 px-5">
				<img src={dashboardBrand.logo} alt="" class="size-6" />
				<span class="text-sm font-semibold tracking-tight text-foreground"
					>{dashboardBrand.name}</span
				>
			</a>
			{@render hostCard()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				{@render sidebarNav()}
			</div>
			<div class="shrink-0 border-t border-border p-2">
				{@render userButton()}
			</div>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
			<header
				class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 lg:px-6"
			>
				<div class="flex min-w-0 items-center gap-2">
					<button
						class="-ml-1 inline-flex size-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
						type="button"
						onclick={() => (mobileNavOpen = true)}
						aria-label={t('shell.openNavigation')}
					>
						<Menu class="size-4" />
					</button>
					<a href={resolve('/')} class="flex shrink-0 items-center lg:hidden">
						<img src={dashboardBrand.logo} alt={dashboardBrand.name} class="size-6" />
					</a>
					{#if activeNav}
						<div class="flex min-w-0 items-center gap-1.5 text-sm">
							<span class="hidden text-muted-foreground sm:inline">{activeNav.group}</span>
							<ChevronRight class="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
							<span class="truncate font-medium text-foreground">{activeNav.item.label}</span>
						</div>
					{/if}
				</div>

				<div class="flex shrink-0 items-center gap-2">
					<button
						class="hidden h-8 w-56 items-center gap-2 border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground md:flex"
						type="button"
						onclick={openCommandPalette}
					>
						<Search class="size-3.5" />
						<span class="flex-1 text-left">{t('shell.search')}</span>
						<kbd
							class="border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground"
							>⌘K</kbd
						>
					</button>
					<button
						class="inline-flex size-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
						type="button"
						onclick={openCommandPalette}
						aria-label={t('shell.searchLabel')}
					>
						<Search class="size-4" />
					</button>
					{#if host}
						<button
							class="inline-flex size-8 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
							type="button"
							onclick={refreshHost}
							disabled={refreshingHost}
							title={t('shell.refreshServer')}
							aria-label={t('shell.refreshServer')}
						>
							{#if refreshingHost}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<RefreshCw class="size-3.5" />
							{/if}
						</button>
					{/if}
					<button
						class="lg:hidden"
						type="button"
						onclick={() => openUserSettings()}
						aria-label={t('shell.accountSettings')}
					>
						<Avatar.Root class="size-8 border border-border">
							<Avatar.Fallback class="bg-primary/15 text-xs font-medium text-foreground">
								{(user?.username || '?').slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
					</button>
				</div>
			</header>

			{#if data.hostnameNotConfigured}
				<div
					role="status"
					class="flex shrink-0 items-start gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-900 lg:px-6 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
				>
					<AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
					<p>{t('shell.hostnameNotConfigured')}</p>
				</div>
			{/if}

			{#if data.newerDatabase}
				<div
					role="status"
					class="flex shrink-0 items-start gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-900 lg:px-6 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
				>
					<AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
					<p>
						{t('shell.newerDatabase', {
							dbVersion: data.newerDatabase.dbVersion,
							appVersion: data.newerDatabase.appVersion
						})}
					</p>
				</div>
			{/if}

			<main class="flex min-h-0 flex-1 overflow-hidden">
				{@render children()}
			</main>
		</div>
	</div>

	<Sheet.Root bind:open={mobileNavOpen}>
		<Sheet.Content side="left" class="flex w-72 flex-col gap-0 border-border bg-sidebar p-0">
			<Sheet.Header class="flex h-14 flex-row items-center gap-2.5 px-5 py-0 text-left">
				<img src={dashboardBrand.logo} alt="" class="size-6" />
				<Sheet.Title class="truncate text-sm text-foreground">{dashboardBrand.name}</Sheet.Title>
			</Sheet.Header>
			{@render hostCard()}
			<div class="min-h-0 flex-1 overflow-y-auto">
				{@render sidebarNav(() => (mobileNavOpen = false))}
			</div>
			<div class="shrink-0 border-t border-border p-2">
				{@render userButton()}
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<UserSettingsDialog bind:open={userSettings.open} bind:activeTab={userSettings.tab} {user} />
	<ConfirmDialog />

	<Command.Dialog bind:open={commandOpen}>
		<Command.Input bind:value={commandSearch} placeholder={t('shell.commandPlaceholder')} />
		<Command.List class="max-h-[350px] bg-background">
			<Command.Empty>{t('shell.noResults')}</Command.Empty>
			{#if filteredNavigateCommands.length > 0}
				<Command.Group heading={t('shell.commandNavigate')}>
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
				<Command.Group heading={t('shell.commandAccount')}>
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
