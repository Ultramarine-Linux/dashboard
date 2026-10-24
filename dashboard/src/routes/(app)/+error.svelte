<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import { resolve } from '$app/paths';
	import { t } from '#lib/i18n/index.js';

	const isNotFound = $derived(page.status === 404);
	const isServerError = $derived(page.status >= 500);
	const heading = $derived(
		isNotFound
			? t('error.notFoundHeading')
			: isServerError
				? t('error.serverErrorHeading')
				: t('error.genericHeading')
	);
	const detail = $derived(
		isNotFound
			? t('error.notFoundDetail')
			: isServerError
				? t('error.serverErrorDetail')
				: (page.error?.message ?? t('error.fallbackDetail'))
	);
</script>

<svelte:head>
	<title>{t('error.pageTitle', { status: page.status })}</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
	<p class="text-4xl font-bold text-foreground">{page.status}</p>
	<div class="space-y-1">
		<p class="text-sm font-medium text-foreground">{heading}</p>
		<p class="max-w-sm text-sm text-muted-foreground">{detail}</p>
	</div>
	<div class="mt-2 flex items-center gap-2">
		{#if !isNotFound}
			<Button variant="outline" size="sm" onclick={() => location.reload()}
				>{t('error.tryAgain')}</Button
			>
		{/if}
		<Button variant="outline" size="sm" href={resolve('')}>{t('error.goHome')}</Button>
	</div>
</div>
