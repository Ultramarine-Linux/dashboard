<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		volumeName,
		server = $bindable(''),
		serverOptions,
		submitting = false,
		onSubmit
	}: {
		open?: boolean;
		volumeName?: string | null;
		server?: string;
		serverOptions: string[];
		submitting?: boolean;
		onSubmit: () => void | Promise<void>;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="border-border bg-background sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('dialogs.attachVolumeTitle')}</Dialog.Title>
			<Dialog.Description
				>{volumeName
					? t('dialogs.attachVolumeDescription', { name: volumeName })
					: t('dialogs.attachThisVolumeDescription')}</Dialog.Description
			>
		</Dialog.Header>
		<div class="flex flex-col gap-2 py-4">
			<Label>{t('dialogs.server')}</Label>
			<select
				bind:value={server}
				class="w-full appearance-none border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
			>
				{#each serverOptions as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</div>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (open = false)} disabled={submitting}
				>{t('common.cancel')}</Button
			>
			<Button size="sm" onclick={onSubmit} disabled={submitting || !server}
				>{submitting ? t('dialogs.attaching') : t('dialogs.attach')}</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
