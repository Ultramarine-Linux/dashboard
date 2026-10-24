<script lang="ts">
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		name = $bindable(''),
		cidr = $bindable('10.0.0.0/16'),
		onSubmit
	}: {
		open?: boolean;
		name?: string;
		cidr?: string;
		onSubmit: () => void | Promise<void>;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="border-border bg-background sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('dialogs.createNetworkTitle')}</Dialog.Title>
			<Dialog.Description>{t('dialogs.createNetworkDescription')}</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-4 py-4">
			<div class="flex flex-col gap-2">
				<Label>{t('common.name')}</Label>
				<Input bind:value={name} placeholder={t('dialogs.networkNamePlaceholder')} />
			</div>
			<div class="flex flex-col gap-2">
				<Label>{t('dialogs.cidrBlock')}</Label>
				<Input bind:value={cidr} placeholder="10.0.0.0/16" />
				<p class="text-xs text-muted-foreground">
					{t('dialogs.cidrHint')}
				</p>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (open = false)}
				>{t('common.cancel')}</Button
			>
			<Button size="sm" onclick={onSubmit} disabled={!name.trim()}>{t('common.create')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
