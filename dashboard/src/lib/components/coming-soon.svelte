<script lang="ts">
	import { t } from '$lib/i18n';
	let { class: className = '' }: { class?: string } = $props();
</script>

<span
	class="inline-flex items-center border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase {className}"
>
	{t('components.comingSoon')}
</span>
