<script lang="ts" module>
	export type StatusTone = 'success' | 'neutral' | 'warning' | 'danger' | 'info';

	const toneByStatus: Record<string, StatusTone> = {
		running: 'success',
		active: 'success',
		healthy: 'success',
		up: 'success',
		enabled: 'success',
		available: 'success',
		ok: 'success',
		exited: 'neutral',
		stopped: 'neutral',
		inactive: 'neutral',
		disabled: 'neutral',
		dead: 'neutral',
		unknown: 'neutral',
		created: 'info',
		configured: 'info',
		paused: 'warning',
		starting: 'warning',
		activating: 'warning',
		deactivating: 'warning',
		restarting: 'warning',
		'auto-restart': 'warning',
		reloading: 'warning',
		degraded: 'warning',
		pending: 'warning',
		unhealthy: 'danger',
		failed: 'danger',
		error: 'danger',
		unavailable: 'danger'
	};

	export function statusTone(status: string | null | undefined): StatusTone {
		return toneByStatus[(status ?? '').trim().toLowerCase()] ?? 'neutral';
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		status,
		tone,
		class: className = ''
	}: { status: string; tone?: StatusTone; class?: string } = $props();

	const resolvedTone = $derived(tone ?? statusTone(status));

	const toneClasses: Record<StatusTone, { badge: string; dot: string }> = {
		success: {
			badge:
				'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:text-emerald-300',
			dot: 'bg-emerald-500'
		},
		neutral: {
			badge: 'border-border bg-muted/60 text-muted-foreground',
			dot: 'bg-muted-foreground/70'
		},
		info: {
			badge: 'border-primary/25 bg-primary/10 text-primary',
			dot: 'bg-primary'
		},
		warning: {
			badge:
				'border-amber-600/25 bg-amber-500/10 text-amber-800 dark:border-amber-400/25 dark:text-amber-300',
			dot: 'bg-amber-500'
		},
		danger: {
			badge: 'border-destructive/30 bg-destructive/10 text-destructive dark:text-red-300',
			dot: 'bg-destructive'
		}
	};
</script>

<span
	class={cn(
		'inline-flex h-5 shrink-0 items-center gap-1.5 border px-2 text-[11px] font-medium whitespace-nowrap capitalize high-contrast:border-foreground high-contrast:bg-background high-contrast:text-foreground',
		toneClasses[resolvedTone].badge,
		className
	)}
>
	<span class={cn('size-1.5', toneClasses[resolvedTone].dot)} aria-hidden="true"></span>
	{status}
</span>
