<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { dashboardBrand } from '$lib/branding';
	import { t } from '$lib/i18n';
	import Check from '~icons/lucide/check';
	import Download from '~icons/lucide/download';
	import Copy from '~icons/nucleo/copy';

	type Props = {
		codes: string[];
		username: string;
		onDone: () => void;
	};

	let { codes, username, onDone }: Props = $props();

	let saved = $state(false);
	let copied = $state(false);

	const text = $derived(
		[
			t('recoveryCodes.fileHeading', { brand: dashboardBrand.title, username }),
			t('recoveryCodes.fileNote'),
			'',
			...codes
		].join('\n') + '\n'
	);

	function copy() {
		void navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function download() {
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `recovery-codes-${username}.txt`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-4">
	<div
		class="border border-amber-300 bg-amber-100 p-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-400"
	>
		{t('recoveryCodes.warning')}
	</div>

	<ul
		class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xs border border-border bg-muted p-3"
		aria-label={t('recoveryCodes.listLabel')}
	>
		{#each codes as code (code)}
			<li class="font-mono text-sm text-foreground">{code}</li>
		{/each}
	</ul>

	<div class="flex gap-2">
		<Button variant="outline" size="sm" class="gap-1.5 text-xs" onclick={download}>
			<Download class="h-3 w-3" />
			{t('common.download')}
		</Button>
		<Button variant="outline" size="sm" class="gap-1.5 text-xs" onclick={copy}>
			{#if copied}
				<Check class="h-3 w-3 text-emerald-500" />
				{t('common.copied')}
			{:else}
				<Copy class="h-3 w-3" />
				{t('common.copy')}
			{/if}
		</Button>
	</div>

	<label class="flex items-center gap-2 text-sm text-foreground">
		<input type="checkbox" bind:checked={saved} />
		{t('recoveryCodes.saved')}
	</label>

	<Button onclick={onDone} disabled={!saved}>{t('common.done')}</Button>
</div>
