<script lang="ts">
	import QRCode from 'qrcode';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import RecoveryCodes from '#lib/components/recovery-codes.svelte';
	import { beginTotpEnrollment, confirmTotpEnrollment } from '#lib/remote/account.remote.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { t } from '#lib/i18n/index.js';
	import Check from '~icons/lucide/check';
	import Loader2 from '~icons/lucide/loader-2';
	import Copy from '~icons/nucleo/copy';
	import ShieldCheck from '~icons/nucleo/shield-check';

	type Props = {
		open?: boolean;
		username: string;
		onComplete?: () => void;
	};

	let { open = $bindable(false), username, onComplete }: Props = $props();

	let step = $state<'loading' | 'verify' | 'codes' | 'error'>('loading');
	let totpUri = $state('');
	let secretKey = $state('');
	let recoveryCodes = $state<string[]>([]);
	let verifyCode = $state('');
	let verifying = $state(false);
	let error = $state('');
	let copiedSecret = $state(false);
	let qrCodeSrc = $state('');

	let normalizedVerifyCode = $derived(verifyCode.replace(/\D/g, ''));

	$effect(() => {
		if (!open) return;
		untrack(() => void begin());
	});

	async function begin() {
		step = 'loading';
		error = '';
		verifyCode = '';
		recoveryCodes = [];
		try {
			const result = await beginTotpEnrollment();
			totpUri = result.otpauthUri;
			secretKey = result.secret;
			step = 'verify';
		} catch (err) {
			error = getErrorMessage(err, t('totp.startFailed'));
			step = 'error';
		}
	}

	$effect(() => {
		const uri = totpUri;
		if (!uri) {
			qrCodeSrc = '';
			return;
		}

		let cancelled = false;
		void QRCode.toDataURL(uri, {
			width: 180,
			margin: 0,
			color: {
				dark: '#fafafa',
				light: '#27272a'
			},
			errorCorrectionLevel: 'M'
		}).then((src) => {
			if (!cancelled) qrCodeSrc = src;
		});

		return () => {
			cancelled = true;
		};
	});

	async function verifyTotp() {
		if (!normalizedVerifyCode || verifying) return;
		verifying = true;
		error = '';
		try {
			const result = await confirmTotpEnrollment({ code: normalizedVerifyCode });
			recoveryCodes = result.recoveryCodes;
			step = 'codes';
			onComplete?.();
		} catch (err) {
			error = getErrorMessage(err, t('totp.invalidCode'));
		} finally {
			verifying = false;
		}
	}

	function copySecret() {
		void navigator.clipboard.writeText(secretKey);
		copiedSecret = true;
		setTimeout(() => (copiedSecret = false), 1500);
	}

	function finish() {
		open = false;
		recoveryCodes = [];
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		// Closing after confirming would lose the recovery codes; require "Done".
		if (!next && step === 'codes') open = true;
	}}
>
	<Dialog.Content class="border-border bg-background sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{step === 'codes' ? t('totp.titleCodes') : t('totp.titleSetup')}
			</Dialog.Title>
			<Dialog.Description>
				{step === 'codes' ? t('totp.descriptionCodes') : t('totp.descriptionSetup')}
			</Dialog.Description>
		</Dialog.Header>

		{#if step === 'loading'}
			<div class="flex justify-center py-8">
				<Loader2 class="size-5 animate-spin text-muted-foreground" />
			</div>
		{:else if step === 'error'}
			<div class="py-4 text-center text-sm text-red-400">{error}</div>
		{:else if step === 'verify'}
			<div class="flex flex-col gap-4 py-4">
				<div class="flex justify-center">
					<div class="rounded-xs border border-border bg-muted p-3">
						{#if qrCodeSrc}
							<img src={qrCodeSrc} alt={t('totp.qrAlt')} />
						{/if}
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label class="text-xs text-muted-foreground">{t('totp.manualKey')}</Label>
					<div class="flex items-center gap-2">
						<code
							class="flex-1 overflow-hidden rounded-xs border border-border bg-muted px-2 py-1.5 font-mono text-xs text-ellipsis whitespace-nowrap text-foreground"
						>
							{secretKey}
						</code>
						<button
							type="button"
							class="shrink-0 text-muted-foreground hover:text-foreground"
							aria-label={t('totp.copyKey')}
							onclick={copySecret}
						>
							{#if copiedSecret}
								<Check class="h-3.5 w-3.5 text-emerald-500" />
							{:else}
								<Copy class="size-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="totp-verify-code">{t('totp.verificationCode')}</Label>
					<Input
						id="totp-verify-code"
						bind:value={verifyCode}
						placeholder="000000"
						class="font-mono tracking-widest"
						autocomplete="one-time-code"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength={6}
						onkeydown={(e) => e.key === 'Enter' && verifyTotp()}
					/>
					{#if error}
						<p class="text-xs text-red-400">{error}</p>
					{/if}
				</div>

				<Button onclick={verifyTotp} disabled={verifying || !normalizedVerifyCode} class="gap-1.5">
					<ShieldCheck class="size-4" />
					{verifying ? t('totp.verifying') : t('totp.verifyEnable')}
				</Button>
			</div>
		{:else if step === 'codes'}
			<div class="py-2">
				<RecoveryCodes codes={recoveryCodes} {username} onDone={finish} />
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
