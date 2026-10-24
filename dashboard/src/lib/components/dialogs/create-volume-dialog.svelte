<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		name = $bindable(''),
		size = $bindable(25),
		submitting = false,
		onSubmit
	}: {
		open?: boolean;
		name?: string;
		size?: number;
		submitting?: boolean;
		onSubmit: () => void | Promise<void>;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="border-border bg-background sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('dialogs.createVolumeTitle')}</Dialog.Title>
			<Dialog.Description>{t('dialogs.createVolumeDescription')}</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-4 py-4">
			<div class="flex flex-col gap-2">
				<Label>{t('common.name')}</Label>
				<Input bind:value={name} placeholder={t('dialogs.volumeNamePlaceholder')} />
			</div>
			<div class="flex flex-col gap-2">
				<Label>{t('dialogs.sizeGb')}</Label>
				<div class="flex items-center gap-3">
					<input
						type="range"
						min="10"
						max="500"
						step="10"
						bind:value={size}
						class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
					/>
					<span class="w-16 text-right text-sm font-medium text-foreground"
						>{t('dialogs.sizeValue', { size })}</span
					>
				</div>
				<p class="text-xs text-muted-foreground">
					{t('dialogs.volumePricing', { price: (size * 0.1).toFixed(2) })}
				</p>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (open = false)} disabled={submitting}
				>{t('common.cancel')}</Button
			>
			<Button size="sm" onclick={onSubmit} disabled={!name.trim() || submitting}
				>{submitting ? t('dialogs.creating') : t('common.create')}</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
