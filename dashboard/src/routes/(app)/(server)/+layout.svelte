<script lang="ts">
	import type { Snippet } from 'svelte';

	// Host identity, navigation and the server refresh live in the app shell
	// (see ../+layout.svelte); this layout only provides the host data.
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
		{@render children()}
	</div>
</div>
