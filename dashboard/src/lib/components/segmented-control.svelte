<script lang="ts" generics="T extends string">
	import { cn } from '$lib/utils';

	type Option = { value: T; label: string };

	let {
		options,
		value,
		onchange,
		label,
		disabled = false,
		class: className = ''
	}: {
		options: readonly Option[];
		value: T;
		onchange: (value: T) => void;
		/** Accessible name for the group. */
		label: string;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<div
	role="group"
	aria-label={label}
	class={cn(
		'inline-flex h-8 items-center gap-0.5 border border-border bg-muted/50 p-0.5 high-contrast:bg-background',
		className
	)}
>
	{#each options as option (option.value)}
		{@const active = option.value === value}
		<button
			type="button"
			aria-pressed={active}
			{disabled}
			onclick={() => {
				if (!active) onchange(option.value);
			}}
			class="h-full px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 {active
				? 'bg-background text-foreground shadow-sm ring-1 ring-border high-contrast:bg-foreground high-contrast:text-background'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			{option.label}
		</button>
	{/each}
</div>
