<script lang="ts">
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		name = $bindable(''),
		submitting = false,
		onSubmit
	}: {
		open?: boolean;
		name?: string;
		submitting?: boolean;
		onSubmit: () => void | Promise<void>;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="border-border bg-background sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('dialogs.createFirewallGroupTitle')}</Dialog.Title>
			<Dialog.Description>{t('dialogs.createFirewallGroupDescription')}</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-4 py-4">
			<div class="flex flex-col gap-2">
				<Label>{t('common.name')}</Label>
				<Input bind:value={name} placeholder={t('dialogs.firewallNamePlaceholder')} />
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
