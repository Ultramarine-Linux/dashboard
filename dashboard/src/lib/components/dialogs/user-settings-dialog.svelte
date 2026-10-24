<script lang="ts">
	import { autofillAttributes } from '$lib/components/ui/input';
	import { invalidate } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { UserSettingsTab } from '$lib/state/user-settings.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RecoveryCodes from '$lib/components/recovery-codes.svelte';
	import TotpOnboardingDialog from './totp-onboarding-dialog.svelte';
	import PasskeyOnboardingDialog from './passkey-onboarding-dialog.svelte';
	import {
		createSshKey as createSshKeyRpc,
		deleteSshKey,
		listSshKeys
	} from '$lib/remote/ssh-keys.remote';
	import { listApiTokens, createApiToken, revokeApiToken } from '$lib/remote/api-tokens.remote';
	import {
		disableTotp,
		getAccountSecurity,
		regenerateRecoveryCodes,
		removePasskey as removePasskeyRpc,
		type AccountSecurity
	} from '$lib/remote/account.remote';
	import { toast } from 'svelte-sonner';
	import { getErrorMessage } from '$lib/utils';
	import { confirmDestructive } from '$lib/confirm.svelte';

	import Check from '~icons/lucide/check';
	import Loader2 from '~icons/lucide/loader-2';
	import Minus from '~icons/lucide/minus';
	import Plus from '~icons/lucide/plus';
	import RefreshCw from '~icons/lucide/refresh-cw';
	import X from '~icons/lucide/x';
	import Copy from '~icons/nucleo/copy';
	import Fingerprint from '~icons/nucleo/fingerprint';
	import Key from '~icons/nucleo/key';
	import Lock from '~icons/nucleo/lock';
	import LogOut from '~icons/nucleo/logout';
	import Monitor from '~icons/nucleo/monitor';
	import Moon from '~icons/nucleo/moon';
	import ShieldCheck from '~icons/nucleo/shield-check';
	import Sun from '~icons/nucleo/sun';
	import SunMoon from '~icons/nucleo/sun-moon';
	import Terminal from '~icons/nucleo/terminal';
	import Trash2 from '~icons/nucleo/trash';
	import User from '~icons/nucleo/user';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { userPrefersMode, setMode } from 'mode-watcher';
	import { contrast, type ContrastPreference } from '$lib/state/contrast.svelte';
	import Circle from '~icons/lucide/circle';
	import ContrastIcon from '~icons/lucide/contrast';
	import Languages from '~icons/lucide/languages';
	import {
		currentLocale,
		localeName,
		locales,
		setLocale,
		t,
		tn,
		type TranslationKey
	} from '$lib/i18n';

	type ThemeMode = 'light' | 'dark' | 'system';

	const themeOptions: { value: ThemeMode; labelKey: TranslationKey; icon: typeof Sun }[] = [
		{ value: 'light', labelKey: 'settings.appearance.theme.light', icon: Sun },
		{ value: 'dark', labelKey: 'settings.appearance.theme.dark', icon: Moon },
		{ value: 'system', labelKey: 'settings.appearance.auto', icon: Monitor }
	];

	const contrastOptions: {
		value: ContrastPreference;
		labelKey: TranslationKey;
		icon: typeof Sun;
	}[] = [
		{ value: 'off', labelKey: 'settings.appearance.off', icon: Circle },
		{ value: 'on', labelKey: 'settings.appearance.on', icon: ContrastIcon },
		{ value: 'auto', labelKey: 'settings.appearance.auto', icon: Monitor }
	];

	let changingLocale = $state(false);

	async function changeLocale(locale: string) {
		changingLocale = true;
		try {
			await setLocale(locale);
		} finally {
			changingLocale = false;
		}
	}

	type Props = {
		open?: boolean;
		activeTab?: UserSettingsTab;
		/** The system account this session belongs to. */
		user: { username: string; uid: number; admin: boolean };
	};

	let {
		open = $bindable(false),
		activeTab = $bindable<UserSettingsTab>('profile'),
		user
	}: Props = $props();

	// Accounts are system accounts: Tetra checks the password with PAM, so it is
	// changed on the console or over SSH, not here.

	let security = $state<AccountSecurity | null>(null);
	let securityLoading = $state(false);
	let totpDialogOpen = $state(false);
	let passkeyDialogOpen = $state(false);
	let removingPasskey = $state<string | null>(null);

	type CodeMethod = 'totp' | 'recovery_code';
	type CodeAction = 'disable' | 'regenerate';
	const codeMethods: [CodeMethod, TranslationKey][] = [
		['totp', 'settings.security.authenticatorCode'],
		['recovery_code', 'settings.security.recoveryCode']
	];
	let codeDialogOpen = $state(false);
	let codeAction = $state<CodeAction>('disable');
	let codeMethod = $state<CodeMethod>('totp');
	let codeValue = $state('');
	let codeSubmitting = $state(false);
	let codeError = $state('');
	let regeneratedCodes = $state<string[]>([]);
	let normalizedCode = $derived(
		codeMethod === 'totp' ? codeValue.replace(/\D/g, '').slice(0, 6) : codeValue.trim()
	);
	let codeValid = $derived(codeMethod === 'totp' ? normalizedCode.length === 6 : !!normalizedCode);

	async function loadSecurity() {
		securityLoading = true;
		try {
			security = await getAccountSecurity();
		} catch (err) {
			toast.error(getErrorMessage(err, t('settings.security.loadFailed')));
		} finally {
			securityLoading = false;
		}
	}

	function openCodeDialog(action: CodeAction) {
		codeAction = action;
		codeMethod = 'totp';
		codeValue = '';
		codeError = '';
		regeneratedCodes = [];
		codeDialogOpen = true;
	}

	async function submitCode() {
		if (!codeValid || codeSubmitting) return;
		codeSubmitting = true;
		codeError = '';
		try {
			const params = { method: codeMethod, code: normalizedCode };
			if (codeAction === 'disable') {
				await disableTotp(params);
				codeDialogOpen = false;
			} else {
				regeneratedCodes = (await regenerateRecoveryCodes(params)).recoveryCodes;
			}
			await loadSecurity();
		} catch (err) {
			codeError = getErrorMessage(err, t('settings.security.codeFailed'));
		} finally {
			codeSubmitting = false;
		}
	}

	async function removePasskey(id: string) {
		const passkey = security?.passkeys.find((p) => p.id === id);
		const ok = await confirmDestructive({
			title: t('settings.security.removePasskeyTitle'),
			description: t('settings.security.removePasskeyDescription', {
				name: passkey?.name ?? t('settings.security.thisPasskey')
			}),
			confirmWord: passkey?.name,
			confirmLabel: t('settings.security.removePasskeyTitle')
		});
		if (!ok) return;
		removingPasskey = id;
		try {
			await removePasskeyRpc({ id });
			await loadSecurity();
		} catch (err) {
			toast.error(getErrorMessage(err, t('settings.security.removePasskeyFailed')));
		} finally {
			removingPasskey = null;
		}
	}

	function formatDate(seconds: number | null | undefined) {
		return seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;
	}

	let sshKeys = $state<{ id: string; name: string; fingerprint: string }[]>([]);
	let sshKeysLoaded = $state(false);
	let sshKeysLoading = $state(false);
	let sshKeyAdding = $state(false);
	let sshKeyRemoving = $state<string | null>(null);
	let newKeyName = $state('');
	let newKeyValue = $state('');
	let newKeyNameFocused = $state(false);

	$effect(() => {
		if (!newKeyNameFocused && newKeyValue != '' && newKeyName == '') {
			newKeyName = newKeyValue.split(' ')[2] ?? '';
		}
	});

	async function loadSshKeys() {
		if (sshKeysLoaded || sshKeysLoading) return;
		sshKeysLoading = true;
		try {
			sshKeys = await listSshKeys();
			sshKeysLoaded = true;
		} catch (err) {
			toast.error(getErrorMessage(err, t('settings.keys.loadFailed')));
		} finally {
			sshKeysLoading = false;
		}
	}

	async function addSshKey() {
		if (!newKeyName.trim() || !newKeyValue.trim() || sshKeyAdding) return;
		sshKeyAdding = true;
		try {
			const res = await createSshKeyRpc({
				name: newKeyName.trim(),
				publicKey: newKeyValue.trim()
			});
			await invalidate('app:ssh-keys');
			sshKeys.push({ id: res.id, name: newKeyName.trim(), fingerprint: res.fingerprint });
			newKeyName = '';
			newKeyValue = '';
		} catch (err) {
			toast.error(getErrorMessage(err, t('settings.keys.addFailed')));
		} finally {
			sshKeyAdding = false;
		}
	}

	async function removeSshKey(id: string) {
		if (sshKeyRemoving) return;
		const key = sshKeys.find((k) => k.id === id);
		const ok = await confirmDestructive({
			title: t('settings.keys.deleteTitle'),
			description: t('settings.keys.deleteDescription', {
				name: key?.name ?? t('settings.keys.thisKey')
			}),
			confirmWord: key?.name,
			confirmLabel: t('settings.keys.deleteTitle')
		});
		if (!ok) return;
		sshKeyRemoving = id;
		sshKeys = sshKeys.filter((k) => k.id !== id);
		try {
			await deleteSshKey({ keyId: id });
			await invalidate('app:ssh-keys');
		} catch (err) {
			sshKeys = [...sshKeys, key!];
			toast.error(getErrorMessage(err, t('settings.keys.removeFailed')));
		} finally {
			sshKeyRemoving = null;
		}
	}

	type ApiTokenState = {
		id: string;
		name: string;
		created: string;
		lastUsedAt: number | null;
	};
	let tokens = $state<ApiTokenState[]>([]);
	let tokensLoading = $state(false);
	let newTokenName = $state('');
	let generatedToken = $state('');
	let copiedTokenId = $state<string | null>(null);

	async function loadTokens() {
		if (tokensLoading || tokens.length > 0) return;
		tokensLoading = true;
		try {
			const result = await listApiTokens();
			tokens = result.map((t) => ({
				id: t.id,
				name: t.name,
				created: new Date(t.createdAt).toISOString().slice(0, 10),
				lastUsedAt: t.lastUsedAt
			}));
		} catch (err) {
			toast.error(getErrorMessage(err, t('settings.api.loadFailed')));
		} finally {
			tokensLoading = false;
		}
	}

	async function generateToken() {
		if (!newTokenName.trim()) return;
		const name = newTokenName.trim();
		const tempId = `temp-${Date.now()}`;
		const now = new Date().toISOString().slice(0, 10);

		tokens.push({ id: tempId, name, created: now, lastUsedAt: null });

		try {
			const result = await createApiToken({ name });
			generatedToken = result.token;
			const idx = tokens.findIndex((t) => t.id === tempId);
			if (idx !== -1) tokens[idx] = { ...tokens[idx], id: result.id };
		} catch (err) {
			tokens = tokens.filter((t) => t.id !== tempId);
			toast.error(getErrorMessage(err, t('settings.api.createFailed')));
		} finally {
			newTokenName = '';
		}
	}

	async function revokeToken(id: string) {
		const idx = tokens.findIndex((t) => t.id === id);
		if (idx === -1) return;
		const tokenToRemove = tokens[idx];
		const ok = await confirmDestructive({
			title: t('settings.api.revokeTitle'),
			description: t('settings.api.revokeDescription', { name: tokenToRemove.name }),
			confirmWord: tokenToRemove.name,
			confirmLabel: t('settings.api.revokeLabel')
		});
		if (!ok) return;
		tokens = tokens.filter((t) => t.id !== id);

		try {
			await revokeApiToken({ tokenId: id });
		} catch (err) {
			tokens.splice(idx, 0, tokenToRemove);
			toast.error(getErrorMessage(err, t('settings.api.revokeFailed')));
		}
	}

	function copyToken(tokenId: string, showFullToken: string | null) {
		if (!showFullToken) return;
		navigator.clipboard.writeText(showFullToken);
		copiedTokenId = tokenId;
		setTimeout(() => (copiedTokenId = null), 1500);
	}

	$effect(() => {
		if (!open) return;
		untrack(() => {
			void Promise.all([loadSshKeys(), loadTokens(), loadSecurity()]);
		});
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[80dvh] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden border-border bg-background p-0 sm:h-[28rem] sm:max-w-4xl"
		showCloseButton={false}
	>
		<DialogPrimitive.Close data-slot="dialog-close" class="absolute top-3 right-3 z-50">
			{#snippet child({ props })}
				<button
					type="button"
					class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
					{...props}
				>
					<X class="h-4 w-4" />
					<span class="sr-only">{t('common.close')}</span>
				</button>
			{/snippet}
		</DialogPrimitive.Close>
		<Tabs.Root
			bind:value={activeTab}
			orientation="vertical"
			class="flex min-h-0 flex-1 flex-col gap-0 sm:flex-row"
		>
			<div class="flex w-full flex-col border-b border-border sm:w-52 sm:border-r sm:border-b-0">
				<div class="px-5 pt-5 pb-4">
					<div class="flex items-center gap-3">
						<Avatar.Root class="h-9 w-9 border border-border">
							<Avatar.Fallback class="bg-primary/10 text-xs font-semibold text-primary">
								{(user?.username ?? '??').slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-foreground">{user?.username}</p>
							<p class="truncate text-xs text-muted-foreground">
								{user?.admin ? t('settings.profile.administrator') : t('settings.profile.user')}
							</p>
						</div>
					</div>
				</div>

				<Tabs.List variant="line" class="flex-col items-start gap-0 bg-transparent px-3">
					<Tabs.Trigger
						value="profile"
						class="w-full justify-start gap-2 rounded-none border-0 px-3 py-2 text-muted-foreground after:hidden data-active:bg-transparent data-active:text-foreground"
					>
						<User class="size-4" />
						{t('settings.tabs.profile')}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="security"
						class="w-full justify-start gap-2 rounded-none border-0 px-3 py-2 text-muted-foreground after:hidden data-active:bg-transparent data-active:text-foreground"
					>
						<Lock class="size-4" />
						{t('settings.tabs.security')}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="keys"
						class="w-full justify-start gap-2 rounded-none border-0 px-3 py-2 text-muted-foreground after:hidden data-active:bg-transparent data-active:text-foreground"
					>
						<Key class="size-4" />
						{t('settings.tabs.keysShort')}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="api"
						class="w-full justify-start gap-2 rounded-none border-0 px-3 py-2 text-muted-foreground after:hidden data-active:bg-transparent data-active:text-foreground"
					>
						<Terminal class="size-4" />
						{t('settings.tabs.apiShort')}
					</Tabs.Trigger>
					<Tabs.Trigger
						value="appearance"
						class="w-full justify-start gap-2 rounded-none border-0 px-3 py-2 text-muted-foreground after:hidden data-active:bg-transparent data-active:text-foreground"
					>
						<SunMoon class="size-4" />
						{t('settings.tabs.appearance')}
					</Tabs.Trigger>
				</Tabs.List>
			</div>

			<div class="relative flex min-h-0 flex-1 flex-col">
				<div class="h-4 shrink-0"></div>
				<div class="settings-scroll relative flex min-h-0 flex-1 flex-col overflow-y-auto">
					<Tabs.Content value="profile" class="mt-0 px-6 py-6">
						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<User class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.profile.account')}
								</p>
							</div>
							<dl class="divide-y divide-border/50 text-sm">
								<div class="flex justify-between gap-4 py-2">
									<dt class="text-muted-foreground">{t('settings.profile.username')}</dt>
									<dd class="font-mono text-foreground">{user?.username}</dd>
								</div>
								<div class="flex justify-between gap-4 py-2">
									<dt class="text-muted-foreground">{t('settings.profile.userId')}</dt>
									<dd class="font-mono text-foreground">{user?.uid}</dd>
								</div>
								<div class="flex justify-between gap-4 py-2">
									<dt class="text-muted-foreground">{t('settings.profile.role')}</dt>
									<dd class="text-foreground">
										{user?.admin ? t('settings.profile.administrator') : t('settings.profile.user')}
									</dd>
								</div>
							</dl>
							<p class="mt-3 text-xs text-muted-foreground">
								{t('settings.profile.accountHint')}
							</p>
						</div>
					</Tabs.Content>

					<Tabs.Content value="security" class="mt-0 space-y-4 px-6 py-6">
						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<Lock class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.security.password')}
								</p>
							</div>
							<p class="text-xs text-muted-foreground">
								{t('settings.security.passwordHintBefore')}
								<code class="font-mono text-foreground">passwd</code>
								{t('settings.security.passwordHintAfter')}
							</p>
						</div>

						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<ShieldCheck class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.security.twoFactor')}
								</p>
							</div>

							{#if securityLoading && !security}
								<div class="space-y-2 py-2">
									<Skeleton class="h-3.5 w-40" />
									<Skeleton class="h-2.5 w-24" />
								</div>
							{:else if security}
								<div class="flex items-center justify-between py-2.5">
									<div class="flex items-center gap-2.5">
										<ShieldCheck class="h-4 w-4 text-muted-foreground" />
										<div>
											<p class="text-sm font-medium text-foreground">
												{t('settings.security.authenticatorApp')}
											</p>
											<p class="text-xs text-muted-foreground">
												{security.totpEnrolled
													? t('common.enabled')
													: t('settings.security.notConfigured')}
											</p>
										</div>
									</div>
									{#if security.totpEnrolled}
										<Button
											variant="destructive"
											size="sm"
											class="h-7 w-20 gap-1.5 text-xs"
											onclick={() => openCodeDialog('disable')}
										>
											<Minus class="h-3 w-3" />
											{t('common.disable')}
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											class="h-7 gap-1.5 text-xs"
											onclick={() => (totpDialogOpen = true)}
										>
											<Plus class="h-3 w-3" />
											{t('settings.security.setUp')}
										</Button>
									{/if}
								</div>

								{#if security.totpEnrolled}
									<div class="border-t border-border/50"></div>
									<div class="flex items-center justify-between py-2.5">
										<div class="flex items-center gap-2.5">
											<Key class="h-4 w-4 text-muted-foreground" />
											<div>
												<p class="text-sm font-medium text-foreground">
													{t('settings.security.recoveryCodes')}
												</p>
												<p class="text-xs text-muted-foreground">
													{tn('settings.security.codesLeft', security.recoveryCodesLeft)}
												</p>
											</div>
										</div>
										<Button
											variant="outline"
											size="sm"
											class="h-7 gap-1.5 text-xs"
											onclick={() => openCodeDialog('regenerate')}
										>
											<RefreshCw class="h-3 w-3" />
											{t('settings.security.newCodes')}
										</Button>
									</div>
								{/if}

								{#if security.passkeysAvailable}
									<div class="border-t border-border/50"></div>
									<div class="py-2.5">
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2.5">
												<Fingerprint class="h-4 w-4 text-muted-foreground" />
												<div>
													<p class="text-sm font-medium text-foreground">
														{t('settings.security.passkeys')}
													</p>
													<p class="text-xs text-muted-foreground">
														{security.passkeys.length > 0
															? tn('settings.security.passkeysRegistered', security.passkeys.length)
															: t('settings.security.notConfigured')}
														{#if security.passkeyHostname}
															{t('settings.security.tiedTo')}
															<span class="font-medium text-foreground"
																>{security.passkeyHostname}</span
															>
														{/if}
													</p>
												</div>
											</div>
											<Button
												variant="outline"
												size="sm"
												class="h-7 w-20 gap-1.5 text-xs"
												onclick={() => (passkeyDialogOpen = true)}
											>
												<Plus class="h-3 w-3" />
												{t('settings.security.addPasskey')}
											</Button>
										</div>

										{#if security.passkeys.length > 0}
											<div class="mt-2 flex flex-col gap-2">
												{#each security.passkeys as pk (pk.id)}
													<div
														class="flex items-center gap-2.5 rounded-xs border border-border/60 bg-background px-3 py-2"
													>
														<Fingerprint class="size-4 shrink-0 text-muted-foreground" />
														<div class="min-w-0">
															<p class="truncate text-sm text-foreground">
																{pk.name || t('settings.security.unnamed')}
															</p>
															<p class="text-xs text-muted-foreground">
																{t('settings.security.passkeyAdded', {
																	date: formatDate(pk.created_at) ?? ''
																})}
																{#if pk.last_used_at}
																	{t('settings.security.passkeyLastUsed', {
																		date: formatDate(pk.last_used_at) ?? ''
																	})}
																{/if}
															</p>
														</div>
														<Button
															variant="ghost"
															size="sm"
															class="ml-auto h-7 w-7 shrink-0 p-0 text-red-400 hover:text-red-300"
															aria-label={t('settings.security.removePasskeyLabel', {
																name: pk.name || t('settings.security.passkeyFallback')
															})}
															onclick={() => removePasskey(pk.id)}
															disabled={removingPasskey === pk.id}
														>
															<Trash2 class="h-3 w-3" />
														</Button>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							{/if}
						</div>

						<div class="rounded-xs border border-red-500/20 bg-red-500/5 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-red-500/10 pb-2">
								<LogOut class="size-4 text-red-400" />
								<p class="text-xs font-semibold tracking-wider text-red-400/80 uppercase">
									{t('settings.security.session')}
								</p>
							</div>
							<form method="POST" action="/logout">
								<button
									type="submit"
									class="flex w-full items-center justify-center gap-2 rounded-xs border border-red-500/20 bg-transparent px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
								>
									<LogOut class="size-4" />
									{t('settings.security.signOut')}
								</button>
							</form>
						</div>
					</Tabs.Content>

					<Tabs.Content value="keys" class="mt-0 space-y-4 px-6 py-6">
						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<Key class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.tabs.keys')}
								</p>
								<a
									href="https://docs.ultramarine-linux.org/server/ssh"
									target="_blank"
									rel="noopener noreferrer"
									class="ml-auto text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
								>
									{t('settings.keys.docs')}
								</a>
							</div>

							{#if sshKeysLoading}
								<div class="divide-y divide-border/50">
									{#each Array.from({ length: 2 }) as _, index (index)}
										<div class="flex items-center justify-between py-2.5">
											<div class="min-w-0 flex-1 space-y-1.5">
												<Skeleton class="h-3.5 w-28" />
												<Skeleton class="h-2.5 w-44" />
											</div>
											<Skeleton class="h-7 w-7 shrink-0" />
										</div>
									{/each}
								</div>
							{:else if sshKeys.length > 0}
								<div class="max-h-48 overflow-y-auto">
									<div class="divide-y divide-border/50">
										{#each sshKeys as key (key.id)}
											<div class="flex items-center justify-between py-2.5">
												<div class="min-w-0">
													<p class="truncate text-sm font-medium text-foreground">{key.name}</p>
													<p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
														{key.fingerprint}
													</p>
												</div>
												<Button
													variant="ghost"
													size="sm"
													class="h-7 w-7 shrink-0 p-0 text-red-400 hover:text-red-300"
													onclick={() => removeSshKey(key.id)}
													disabled={sshKeyRemoving === key.id}
												>
													<Trash2 class="h-3 w-3" />
												</Button>
											</div>
										{/each}
									</div>
								</div>
							{:else}
								<p class="py-2 text-center text-xs text-muted-foreground">
									{t('settings.keys.empty')}
								</p>
							{/if}

							<div class="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3">
								<Input
									bind:value={newKeyName}
									placeholder={t('settings.keys.namePlaceholder')}
									class="h-8 text-xs"
									onfocus={() => (newKeyNameFocused = true)}
									onblur={() => (newKeyNameFocused = false)}
								/>
								<textarea
									bind:value={newKeyValue}
									{...autofillAttributes(undefined)}
									placeholder="ssh-ed25519 AAAA..."
									rows="3"
									class="w-full resize-none border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
								></textarea>
								<Button
									variant="outline"
									size="sm"
									class="w-fit gap-1.5 text-xs"
									onclick={addSshKey}
									disabled={!newKeyName.trim() || !newKeyValue.trim() || sshKeyAdding}
								>
									{#if sshKeyAdding}
										<Loader2 class="h-3 w-3 animate-spin" />
										{t('settings.keys.adding')}
									{:else}
										<Plus class="h-3 w-3" />
										{t('settings.keys.add')}
									{/if}
								</Button>
							</div>
						</div>
					</Tabs.Content>

					<Tabs.Content value="api" class="mt-0 flex-1 overflow-y-auto px-6 py-6">
						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<Key class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.tabs.api')}
								</p>
							</div>

							{#if generatedToken}
								<div
									class="mb-3 border border-amber-300 bg-amber-100 p-3 dark:border-amber-800/50 dark:bg-amber-950/20"
								>
									<p class="text-xs font-medium text-amber-800 dark:text-amber-400">
										{t('settings.api.copyNow')}
									</p>
									<div class="mt-2 flex items-center gap-2">
										<code
											class="flex-1 overflow-hidden bg-muted px-2 py-1 font-mono text-xs text-ellipsis whitespace-nowrap text-foreground"
										>
											{generatedToken}
										</code>
										<button
											type="button"
											class="shrink-0 text-muted-foreground hover:text-foreground"
											aria-label={t('common.copy')}
											onclick={() => copyToken('new-token', generatedToken)}
										>
											{#if copiedTokenId === 'new-token'}
												<Check class="h-3.5 w-3.5 text-emerald-500" />
											{:else}
												<Copy class="size-4" />
											{/if}
										</button>
									</div>
								</div>
							{/if}

							{#if tokensLoading}
								<div class="divide-y divide-border/50">
									{#each Array.from({ length: 2 }) as _, index (index)}
										<div class="flex items-center justify-between py-2.5">
											<div class="min-w-0 flex-1 space-y-1.5">
												<Skeleton class="h-3.5 w-24" />
												<Skeleton class="h-2.5 w-40" />
											</div>
											<Skeleton class="h-7 w-14 shrink-0" />
										</div>
									{/each}
								</div>
							{:else if tokens.length > 0}
								<div class="max-h-48 overflow-y-auto">
									<div class="divide-y divide-border/50">
										{#each tokens as token (token.id)}
											<div class="flex items-center justify-between py-2.5">
												<div class="min-w-0">
													<p class="truncate text-sm font-medium text-foreground">{token.name}</p>
													<p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
														um-stack-****...****
														<span class="ml-2 font-sans text-muted-foreground"
															>{t('settings.api.created', { date: token.created })}</span
														>
													</p>
												</div>
												<Button
													variant="ghost"
													size="sm"
													class="h-7 shrink-0 px-2 text-xs text-red-400 hover:text-red-300"
													onclick={() => revokeToken(token.id)}
												>
													{t('settings.api.revoke')}
												</Button>
											</div>
										{/each}
									</div>
								</div>
							{:else}
								<p class="py-2 text-center text-xs text-muted-foreground">
									{t('settings.api.empty')}
								</p>
							{/if}

							<div class="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
								<Input
									bind:value={newTokenName}
									placeholder={t('settings.api.namePlaceholder')}
									class="h-8 text-xs"
								/>
								<Button
									variant="outline"
									size="sm"
									class="shrink-0 gap-1.5 text-xs"
									onclick={generateToken}
									disabled={!newTokenName.trim()}
								>
									<Plus class="h-3 w-3" />
									{t('settings.api.generate')}
								</Button>
							</div>
						</div>
					</Tabs.Content>

					<Tabs.Content value="appearance" class="mt-0 px-6 py-6">
						<div class="rounded-xs border border-border/60 p-4">
							<div class="mb-3 flex items-center gap-2 border-b border-border/50 pb-2">
								<SunMoon class="size-4 text-primary" />
								<p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
									{t('settings.appearance.heading')}
								</p>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label>{t('settings.appearance.theme')}</Label>
								<div class="grid grid-cols-3 gap-2">
									{#each themeOptions as option (option.value)}
										{@const Icon = option.icon}
										<button
											type="button"
											aria-pressed={userPrefersMode.current === option.value}
											onclick={() => setMode(option.value)}
											class="flex flex-col items-center gap-1.5 border px-3 py-2.5 text-xs transition-colors {userPrefersMode.current ===
											option.value
												? 'border-primary bg-primary/10 text-foreground'
												: 'border-border text-muted-foreground hover:border-ring hover:text-foreground'}"
										>
											<Icon class="h-4 w-4" />
											{t(option.labelKey)}
										</button>
									{/each}
								</div>
								<p class="mt-1.5 text-xs text-muted-foreground">
									{t('settings.appearance.themeHint')}
								</p>
							</div>
							<fieldset class="mt-4 border-t border-border/50 pt-4">
								<legend class="float-left mb-1.5 w-full text-sm leading-none font-medium">
									{t('settings.appearance.contrast')}
								</legend>
								<div class="clear-both grid grid-cols-3 gap-2">
									{#each contrastOptions as option (option.value)}
										{@const Icon = option.icon}
										<button
											type="button"
											aria-pressed={contrast.preference === option.value}
											onclick={() => contrast.setPreference(option.value)}
											class="flex flex-col items-center gap-1.5 border px-3 py-2.5 text-xs transition-colors {contrast.preference ===
											option.value
												? 'border-primary bg-primary/10 text-foreground'
												: 'border-border text-muted-foreground hover:border-ring hover:text-foreground'}"
										>
											<Icon class="h-4 w-4" />
											{t(option.labelKey)}
										</button>
									{/each}
								</div>
								<p class="mt-1.5 text-xs text-muted-foreground">
									{contrast.preference === 'auto'
										? t(
												contrast.systemPrefersMore
													? 'settings.appearance.contrastHintAutoOn'
													: 'settings.appearance.contrastHintAutoOff'
											)
										: t('settings.appearance.contrastHint')}
								</p>
							</fieldset>
							{#if locales.length > 1}
								<div class="mt-4 flex flex-col gap-1.5 border-t border-border/50 pt-4">
									<Label for="settings-language" class="flex items-center gap-1.5">
										<Languages class="size-3.5 text-muted-foreground" />
										{t('settings.appearance.language')}
									</Label>
									<select
										id="settings-language"
										class="h-9 w-full border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
										value={currentLocale()}
										disabled={changingLocale}
										onchange={(event) => changeLocale(event.currentTarget.value)}
									>
										{#each locales as locale (locale)}
											<option value={locale} lang={locale}>{localeName(locale)}</option>
										{/each}
									</select>
									<p class="mt-1.5 text-xs text-muted-foreground">
										{t('settings.appearance.languageHint')}
									</p>
								</div>
							{/if}
						</div>
					</Tabs.Content>
				</div>
			</div>
		</Tabs.Root>
	</Dialog.Content>

	{#if totpDialogOpen}
		<TotpOnboardingDialog
			bind:open={totpDialogOpen}
			username={user.username}
			onComplete={loadSecurity}
		/>
	{/if}
	<PasskeyOnboardingDialog
		bind:open={passkeyDialogOpen}
		hostname={security?.passkeyHostname ?? null}
		onComplete={loadSecurity}
	/>
	<Dialog.Root
		bind:open={codeDialogOpen}
		onOpenChange={(next) => {
			// New recovery codes are shown once; require "Done" to close.
			if (!next && regeneratedCodes.length > 0) codeDialogOpen = true;
		}}
	>
		<Dialog.Content class="border-border bg-background sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>
					{codeAction === 'disable'
						? t('settings.security.disableTitle')
						: t('settings.security.newCodesTitle')}
				</Dialog.Title>
				<Dialog.Description>
					{#if regeneratedCodes.length > 0}
						{t('settings.security.oldCodesInvalid')}
					{:else if codeAction === 'disable'}
						{t('settings.security.disableDescription')}
					{:else}
						{t('settings.security.regenerateDescription')}
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			{#if regeneratedCodes.length > 0}
				<div class="py-2">
					<RecoveryCodes
						codes={regeneratedCodes}
						username={user.username}
						onDone={() => {
							regeneratedCodes = [];
							codeDialogOpen = false;
						}}
					/>
				</div>
			{:else}
				<form
					class="flex flex-col gap-4 py-4"
					onsubmit={(e) => {
						e.preventDefault();
						void submitCode();
					}}
				>
					<div class="flex rounded-xs border border-border bg-background/40 p-1">
						{#each codeMethods as [method, labelKey] (method)}
							<button
								type="button"
								class={[
									'flex-1 rounded-xs px-3 py-1.5 text-xs font-medium transition-colors',
									codeMethod === method
										? 'bg-muted text-foreground'
										: 'text-muted-foreground hover:text-foreground'
								]}
								onclick={() => {
									codeMethod = method as CodeMethod;
									codeValue = '';
									codeError = '';
								}}
							>
								{t(labelKey)}
							</button>
						{/each}
					</div>

					<div class="flex flex-col gap-1.5">
						<Label for="security-code">
							{codeMethod === 'totp'
								? t('settings.security.authenticatorCode')
								: t('settings.security.recoveryCode')}
						</Label>
						{#if codeMethod === 'totp'}
							<Input
								id="security-code"
								bind:value={codeValue}
								inputmode="numeric"
								pattern="[0-9]*"
								placeholder="000000"
								maxlength={6}
								autocomplete="one-time-code"
							/>
						{:else}
							<Input
								id="security-code"
								bind:value={codeValue}
								placeholder="xxxxx-xxxxx"
								autocomplete="off"
							/>
						{/if}
						{#if codeError}
							<p class="text-xs text-red-400">{codeError}</p>
						{/if}
					</div>

					<Dialog.Footer>
						<Button
							variant="outline"
							type="button"
							onclick={() => (codeDialogOpen = false)}
							disabled={codeSubmitting}
						>
							{t('common.cancel')}
						</Button>
						<Button
							variant={codeAction === 'disable' ? 'destructive' : 'default'}
							type="submit"
							class="gap-1.5"
							disabled={codeSubmitting || !codeValid}
						>
							{#if codeSubmitting}
								<Loader2 class="h-3 w-3 animate-spin" />
							{/if}
							{codeAction === 'disable'
								? t('common.disable')
								: t('settings.security.createNewCodes')}
						</Button>
					</Dialog.Footer>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</Dialog.Root>

<style>
	:global(.settings-scroll) {
		scrollbar-gutter: stable;
		scrollbar-color: transparent transparent;
		scrollbar-width: thin;
	}
	:global(.settings-scroll:hover) {
		scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
	}
	:global(.settings-scroll::-webkit-scrollbar) {
		width: 5px;
	}
	:global(.settings-scroll::-webkit-scrollbar-track) {
		background: transparent;
	}
	:global(.settings-scroll::-webkit-scrollbar-thumb) {
		background-color: transparent;
		border-radius: 9999px;
		transition: background-color 0.2s;
	}
	:global(.settings-scroll:hover::-webkit-scrollbar-thumb) {
		background-color: rgba(255, 255, 255, 0.12);
	}
	:global(.settings-scroll::-webkit-scrollbar-thumb:hover) {
		background-color: rgba(198, 113, 109, 0.4);
	}
	:global(.settings-scroll::-webkit-scrollbar-corner) {
		background: transparent;
	}
</style>
