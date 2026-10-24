<script lang="ts">
	import type { Snippet } from 'svelte';

	// Navigation lives in the app shell (see ../+layout.svelte); the server
	// layout only enforces administrator access.
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
	{@render children()}
</div>
