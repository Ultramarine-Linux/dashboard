<script lang="ts">
	import { t, tn } from '$lib/i18n';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import {
		getLauncherEntry,
		listLauncherEntries,
		removeLauncherEntry,
		saveLauncherEntry
	} from '$lib/remote/launcher.remote';
	import type { LauncherEntry, LauncherVisibility } from '$lib/permissions';
	import { confirmDestructive } from '$lib/confirm.svelte';
	import { pageTitle } from '$lib/branding';
	import { getErrorMessage } from '$lib/utils';
	import ExternalLink from '~icons/lucide/external-link';
	import Loader2 from '~icons/lucide/loader-2';
	import Plus from '~icons/lucide/plus';
	import Pencil from '~icons/nucleo/pencil';
	import Trash2 from '~icons/nucleo/trash';

	const isAdmin = $derived(page.data.isAdmin === true);

	let entries = $state<LauncherEntry[]>([]);
	let loading = $state(true);
	let loadError = $state('');

	$effect(() => {
		untrack(() => void load());
	});

	async function load() {
		loading = true;
		loadError = '';
		try {
			entries = await listLauncherEntries();
		} catch (err) {
			loadError = getErrorMessage(err, t('services.loadFailed'));
		} finally {
			loading = false;
		}
	}

	type VisibilityKind = LauncherVisibility['kind'];

	let editorOpen = $state(false);
	let editingId = $state<string | null>(null);
	let name = $state('');
	let url = $state('');
	let icon = $state('');
	let visibility = $state<VisibilityKind>('everyone');
	let users = $state('');
	let groups = $state('');
	let isPublic = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	async function editEntry(id: string) {
		try {
			// Start from Tetra's current entry, not the list loaded earlier.
			fillEditor(await getLauncherEntry({ id }));
		} catch (err) {
			loadError = getErrorMessage(err, t('services.loadOneFailed'));
		}
	}

	function fillEditor(entry?: LauncherEntry) {
		editingId = entry?.id ?? null;
		name = entry?.name ?? '';
		url = entry?.url ?? '';
		icon = entry?.icon ?? '';
		visibility = entry?.visibility?.kind ?? 'everyone';
		users = entry?.visibility?.kind === 'members' ? entry.visibility.users.join(', ') : '';
		groups = entry?.visibility?.kind === 'members' ? entry.visibility.groups.join(', ') : '';
		isPublic = entry?.public === true;
		saveError = '';
		editorOpen = true;
	}

	async function save() {
		if (saving) return;
		saving = true;
		saveError = '';
		try {
			await saveLauncherEntry({
				...(editingId ? { id: editingId } : {}),
				name,
				url,
				icon,
				visibility,
				users,
				groups,
				public: isPublic
			});
			editorOpen = false;
			await load();
		} catch (err) {
			saveError = getErrorMessage(err, t('services.saveFailed'));
		} finally {
			saving = false;
		}
	}

	async function remove(entry: LauncherEntry) {
		const ok = await confirmDestructive({
			title: t('services.removeTitle'),
			description: t('services.removeDescription', { name: entry.name }),
			confirmLabel: t('services.removeTitle')
		});
		if (!ok) return;
		try {
			await removeLauncherEntry({ id: entry.id });
			entries = entries.filter((item) => item.id !== entry.id);
		} catch (err) {
			loadError = getErrorMessage(err, t('services.removeFailed'));
		}
	}

	function visibilityLabel(value: LauncherVisibility | undefined) {
		if (!value) return null;
		if (value.kind === 'everyone') return t('services.visibilityEveryone');
		if (value.kind === 'admins') return t('services.visibilityAdmins');
		const count = value.users.length + value.groups.length;
		return tn('services.usersAndGroups', count);
	}

	function isImageUrl(value: string | null) {
		return !!value && /^(https?:\/\/|\/)/.test(value);
	}

	function hostOf(value: string) {
		try {
			return new URL(value).host;
		} catch {
			return value;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(t('services.title'))}</title>
</svelte:head>

<section class="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{t('services.title')}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{isAdmin ? t('services.descriptionAdmin') : t('services.descriptionUser')}
			</p>
		</div>
		{#if isAdmin}
			<Button size="sm" class="h-7 gap-1.5 text-xs" onclick={() => fillEditor()}>
				<Plus class="h-3 w-3" />
				{t('services.add')}
			</Button>
		{/if}
	</div>

	{#if loadError}
		<div class="mt-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{loadError}
		</div>
	{/if}

	{#if loading}
		<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
			<Loader2 class="size-3 animate-spin" />
			{t('services.loading')}
		</div>
	{:else if entries.length === 0 && !loadError}
		<div class="mt-6 border border-dashed border-border p-8 text-center">
			<p class="text-sm text-foreground">
				{isAdmin ? t('services.emptyAdmin') : t('services.emptyUser')}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">
				{isAdmin ? t('services.emptyHintAdmin') : t('services.emptyHintUser')}
			</p>
		</div>
	{:else}
		<ul class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each entries as entry (entry.id)}
				<li class="flex items-center gap-3 border border-border p-4">
					<div
						class="flex size-10 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted/40 text-sm font-semibold text-foreground"
						aria-hidden="true"
					>
						{#if isImageUrl(entry.icon)}
							<img src={entry.icon} alt="" class="size-6 object-contain" />
						{:else}
							{entry.name.slice(0, 1).toUpperCase()}
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-foreground">{entry.name}</p>
						<p class="truncate text-xs text-muted-foreground">{hostOf(entry.url)}</p>
						{#if isAdmin && entry.visibility}
							<div class="mt-1.5 flex flex-wrap gap-1">
								<Badge variant="secondary" class="text-[10px]">
									{visibilityLabel(entry.visibility)}
								</Badge>
								{#if entry.public}
									<Badge variant="outline" class="text-[10px]">{t('services.publicPage')}</Badge>
								{/if}
							</div>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-1">
						{#if isAdmin}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 w-7 p-0"
								aria-label={t('services.editAria', { name: entry.name })}
								onclick={() => editEntry(entry.id)}
							>
								<Pencil class="h-3 w-3" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="h-7 w-7 p-0 text-red-400 hover:text-red-300"
								aria-label={t('services.removeAria', { name: entry.name })}
								onclick={() => remove(entry)}
							>
								<Trash2 class="h-3 w-3" />
							</Button>
						{/if}
						<Button
							size="sm"
							class="h-7 gap-1.5 text-xs"
							href={entry.url}
							target="_blank"
							rel="noopener noreferrer"
						>
							{t('services.open')}
							<ExternalLink class="h-3 w-3" />
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if isAdmin}
	<Dialog.Root bind:open={editorOpen}>
		<Dialog.Content class="border-border bg-background sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{editingId ? t('services.edit') : t('services.add')}</Dialog.Title>
				<Dialog.Description>
					{t('services.dialogDescription')}
				</Dialog.Description>
			</Dialog.Header>

			<form
				class="flex flex-col gap-4 py-2"
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="service-name">{t('common.name')}</Label>
					<Input id="service-name" bind:value={name} placeholder="Nextcloud" required />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="service-url">{t('services.address')}</Label>
					<Input
						id="service-url"
						bind:value={url}
						type="url"
						placeholder="https://cloud.example.com"
						required
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="service-icon">{t('services.iconUrl')}</Label>
					<Input id="service-icon" bind:value={icon} placeholder="https://…/icon.svg" />
				</div>
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1.5 text-sm font-medium">{t('services.whoCanSee')}</legend>
					{#each [['everyone', 'services.visibilityOptionEveryone'], ['admins', 'services.visibilityOptionAdmins'], ['members', 'services.visibilityOptionMembers']] as const as [value, labelKey] (value)}
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" name="visibility" {value} bind:group={visibility} />
							{t(labelKey)}
						</label>
					{/each}
				</fieldset>
				{#if visibility === 'members'}
					<div class="flex flex-col gap-1.5">
						<Label for="service-users">{t('services.users')}</Label>
						<Input id="service-users" bind:value={users} placeholder="alice, bob" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="service-groups">{t('services.groups')}</Label>
						<Input id="service-groups" bind:value={groups} placeholder="family" />
					</div>
				{/if}
				<div class="flex items-center justify-between gap-4">
					<Label for="service-public" class="flex flex-col items-start gap-0.5">
						<span>{t('services.showPublic')}</span>
						<span class="text-xs font-normal text-muted-foreground">
							{t('services.showPublicHint')}
						</span>
					</Label>
					<Switch id="service-public" bind:checked={isPublic} />
				</div>
				{#if saveError}
					<p class="text-xs text-red-400">{saveError}</p>
				{/if}
				<Dialog.Footer>
					<Button variant="outline" type="button" onclick={() => (editorOpen = false)}>
						{t('common.cancel')}
					</Button>
					<Button type="submit" disabled={saving || !name.trim() || !url.trim()}>
						{saving ? t('services.saving') : t('common.save')}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
