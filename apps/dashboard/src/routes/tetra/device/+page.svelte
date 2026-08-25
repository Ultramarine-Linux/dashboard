<script lang="ts">
	let { data, form } = $props();
</script>

<div class="mx-auto max-w-lg space-y-6 p-8">
	<h1 class="text-xl font-semibold">Authorize Tetra host</h1>
	{#if !data.code}
		<p class="text-sm text-muted-foreground">Run <code>tetra enroll</code> on the host, then open the verification URL with its code.</p>
	{:else if !data.enrollment}
		<p class="text-sm text-destructive">Enrollment code not found.</p>
	{:else}
		<div class="space-y-2 rounded border border-border p-4 text-sm">
			<p><strong>Code:</strong> {data.enrollment.userCode}</p>
			<p><strong>Name:</strong> {data.enrollment.displayName}</p>
			<p><strong>Hostname:</strong> {data.enrollment.hostname || 'unknown'}</p>
			<p><strong>Agent URL:</strong> <code>{data.enrollment.agentUrl}</code></p>
			<p><strong>Host fingerprint:</strong> <code>{data.enrollment.hostPublicKey}</code></p>
			<p><strong>Status:</strong> {data.enrollment.status}</p>
		</div>
		{#if data.enrollment.status === 'pending'}
			<div class="flex gap-3">
				<form method="POST" action="?/approve"><input type="hidden" name="code" value={data.code} /><button class="rounded bg-primary px-4 py-2 text-primary-foreground" type="submit">Approve host</button></form>
				<form method="POST" action="?/deny"><input type="hidden" name="code" value={data.code} /><button class="rounded border border-border px-4 py-2" type="submit">Deny</button></form>
			</div>
		{:else if form?.approved}
			<p class="text-sm text-green-600">Host approved. Return to the terminal to finish setup.</p>
		{/if}
	{/if}
</div>
