<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { AdminState, type AdminLayoutData } from '$lib/state/admin.svelte';

	let { data, children }: { data: AdminLayoutData; children: Snippet } = $props();
	const admin = new AdminState(untrack(() => data));
	$effect(() => admin.sync(data));
</script>

<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
	{@render children()}
</div>
