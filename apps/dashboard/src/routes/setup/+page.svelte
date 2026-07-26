<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { dashboardBrand, pageTitle } from '$lib/branding';
	import { planSetupDomain, saveSetupDomain, type SetupState } from '$lib/remote/setup.remote';
	import { enrollLocalTetra } from '$lib/remote/managed-hosts.remote';
	import type { SetupPlan } from '$lib/server/setup/taidan';
	import { getErrorMessage } from '$lib/utils';
	import ArrowRight from '~icons/lucide/arrow-right';
	import Check from '~icons/lucide/check';
	import Loader2 from '~icons/lucide/loader-2';
	import AlertTriangle from '~icons/nucleo/alert-triangle';
	import Globe from '~icons/nucleo/globe';
	import Server from '~icons/nucleo/server';

	type PageData = {
		setup: SetupState;
	};

	let { data }: { data: PageData } = $props();
	const initialSetup = untrack(() => data.setup);
	let domainMode = $state<'fyra_subdomain' | 'custom_domain'>(
		initialSetup.domainMode ?? 'fyra_subdomain'
	);
	let rootDomain = $state(initialSetup.rootDomain ?? '');
	let accessMode = $state<'direct' | 'cloudflare_tunnel' | 'manual_tunnel'>(
		initialSetup.accessMode ?? 'direct'
	);
	let plan = $state<SetupPlan | null>(initialSetup.taidanPlan);
	let loadingPlan = $state(false);
	let saving = $state(false);
	let detectingLocal = $state(false);
	let environment = $state<'local' | 'remote'>('local');
	let localEnvironment: 'idle' | 'detecting' | 'found' | 'not_found' = $state('idle');
	let localEnvironmentName = $state('');
	let error = $state('');

	const domainPlaceholder = $derived(domainMode === 'fyra_subdomain' ? 'my-server' : 'example.com');
	const displayRootDomain = $derived(
		domainMode === 'fyra_subdomain' && rootDomain && !rootDomain.endsWith('.fyra.one')
			? `${rootDomain}.fyra.one`
			: rootDomain
	);

	async function previewPlan() {
		loadingPlan = true;
		error = '';
		try {
			plan = await planSetupDomain({ domainMode, rootDomain, accessMode });
		} catch (err) {
			error = getErrorMessage(err, 'Unable to plan setup.');
		} finally {
			loadingPlan = false;
		}
	}

	async function detectLocalEnvironment() {
		if (detectingLocal) return;
		detectingLocal = true;
		localEnvironment = 'detecting';
		error = '';
		try {
			await saveSetupDomain({ domainMode, rootDomain, accessMode });
			const host = await enrollLocalTetra({
				displayName: rootDomain.trim() ? `${rootDomain.trim()} (local host)` : 'Local host'
			});
			if (!host) {
				localEnvironment = 'not_found';
				error =
					'No local Tetra environment was found. Start Tetra and try again, or add a remote environment.';
				return;
			}
			localEnvironment = 'found';
			localEnvironmentName = host.displayName;
		} catch (err) {
			localEnvironment = 'not_found';
			error = getErrorMessage(err, 'Local Tetra detection failed.');
		} finally {
			detectingLocal = false;
		}
	}

	async function finishSetup() {
		saving = true;
		error = '';
		try {
			await saveSetupDomain({ domainMode, rootDomain, accessMode });
			await goto(environment === 'remote' ? '/hosts/create' : '/hosts');
		} catch (err) {
			error = getErrorMessage(err, 'Unable to save setup.');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Setup')}</title>
</svelte:head>

<main class="min-h-screen bg-background px-4 py-8">
	<div class="mx-auto flex max-w-5xl flex-col gap-6">
		<div class="flex items-center gap-2">
			<img src={dashboardBrand.logo} alt="" class="size-6" />
			<div>
				<p class="text-sm font-semibold text-foreground">{dashboardBrand.name}</p>
				<p class="text-xs text-muted-foreground">First-run setup</p>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<section class="border border-border bg-card p-6">
				<div class="mb-6 flex items-start gap-3">
					<div
						class="flex size-10 shrink-0 items-center justify-center border border-border bg-muted/30"
					>
						<Globe class="size-5 text-muted-foreground" />
					</div>
					<div>
						<h1 class="text-xl font-semibold text-foreground">Choose your server domain</h1>
						<p class="mt-1 text-sm text-muted-foreground">
							The dashboard will live at <code>dash.&lt;domain&gt;</code>. Apps can use configurable
							subdomains under the same root by default. After you choose the domain, Dashboard will
							automatically look for a local Tetra endpoint when local development credentials are
							available.
						</p>
					</div>
				</div>

				{#if error}
					<div
						class="mb-4 flex items-center gap-2 border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-400"
					>
						<AlertTriangle class="size-4 shrink-0" />{error}
					</div>
				{/if}

				<div class="space-y-5">
					<div class="grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							class="border p-4 text-left transition-colors {domainMode === 'fyra_subdomain'
								? 'border-primary bg-primary/10'
								: 'border-border hover:border-ring'}"
							onclick={() => (domainMode = 'fyra_subdomain')}
						>
							<p class="text-sm font-medium text-foreground">Use a fyra.one subdomain</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Fastest path. We can manage DNS through Cloudflare for domains under fyra.one.
							</p>
						</button>
						<button
							type="button"
							class="border p-4 text-left transition-colors {domainMode === 'custom_domain'
								? 'border-primary bg-primary/10'
								: 'border-border hover:border-ring'}"
							onclick={() => (domainMode = 'custom_domain')}
						>
							<p class="text-sm font-medium text-foreground">Use my own domain</p>
							<p class="mt-1 text-xs text-muted-foreground">
								You keep DNS control. We’ll show records and validation steps.
							</p>
						</button>
					</div>

					<label class="block space-y-1.5 text-xs font-medium text-muted-foreground">
						{domainMode === 'fyra_subdomain' ? 'Subdomain' : 'Domain'}
						<div class="flex items-center gap-2">
							<Input bind:value={rootDomain} placeholder={domainPlaceholder} />
							{#if domainMode === 'fyra_subdomain'}
								<span class="shrink-0 text-sm text-muted-foreground">.fyra.one</span>
							{/if}
						</div>
						{#if displayRootDomain}
							<p class="text-xs text-muted-foreground">Dashboard URL: dash.{displayRootDomain}</p>
						{/if}
					</label>

					<div class="space-y-2">
						<p class="text-xs font-medium text-muted-foreground">
							How will traffic reach this server?
						</p>
						<div class="grid gap-3">
							<label class="flex cursor-pointer gap-3 border border-border p-3 hover:border-ring">
								<input bind:group={accessMode} type="radio" value="direct" />
								<span>
									<span class="block text-sm font-medium text-foreground"
										>Direct port forwarding</span
									>
									<span class="block text-xs text-muted-foreground"
										>Best if ports 80/443 can reach this server.</span
									>
								</span>
							</label>
							<label class="flex cursor-pointer gap-3 border border-border p-3 hover:border-ring">
								<input bind:group={accessMode} type="radio" value="cloudflare_tunnel" />
								<span>
									<span class="block text-sm font-medium text-foreground">Cloudflare Tunnel</span>
									<span class="block text-xs text-muted-foreground"
										>Good when port forwarding is unavailable. Planned integration.</span
									>
								</span>
							</label>
							<label class="flex cursor-pointer gap-3 border border-border p-3 hover:border-ring">
								<input bind:group={accessMode} type="radio" value="manual_tunnel" />
								<span>
									<span class="block text-sm font-medium text-foreground"
										>I’ll handle tunneling manually</span
									>
									<span class="block text-xs text-muted-foreground"
										>For Tailscale, VPNs, or another tunnel provider.</span
									>
								</span>
							</label>
						</div>
					</div>

					<div class="space-y-3 border-t border-border pt-5">
						<p class="text-sm font-semibold text-foreground">Choose an environment</p>
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								class="border p-4 text-left transition-colors {environment === 'local'
									? 'border-primary bg-primary/10'
									: 'border-border hover:border-ring'}"
								onclick={() => (environment = 'local')}
							>
								<Server class="mb-2 size-5 text-muted-foreground" />
								<p class="text-sm font-medium text-foreground">Local environment</p>
								<p class="mt-1 text-xs text-muted-foreground">
									Detect and enroll Tetra running on this machine or local stack.
								</p>
							</button>
							<button
								type="button"
								class="border p-4 text-left transition-colors {environment === 'remote'
									? 'border-primary bg-primary/10'
									: 'border-border hover:border-ring'}"
								onclick={() => (environment = 'remote')}
							>
								<Globe class="mb-2 size-5 text-muted-foreground" />
								<p class="text-sm font-medium text-foreground">Add remote environment</p>
								<p class="mt-1 text-xs text-muted-foreground">
									Finish setup and enter a remote Tetra endpoint manually.
								</p>
							</button>
						</div>
						{#if environment === 'local'}
							<Button
								onclick={detectLocalEnvironment}
								disabled={detectingLocal}
								class="w-full gap-1.5"
							>
								{#if detectingLocal}<Loader2 class="size-4 animate-spin" />{:else}<Server
										class="size-4"
									/>{/if}
								{localEnvironment === 'found'
									? `Local environment: ${localEnvironmentName}`
									: 'Detect local Tetra'}
							</Button>
						{:else}
							<Button onclick={finishSetup} loading={saving} class="w-full gap-1.5">
								Continue to remote environment <ArrowRight class="size-4" />
							</Button>
						{/if}
					</div>
				</div>
			</section>

			<aside class="border border-border bg-card p-6">
				<h2 class="text-sm font-semibold text-foreground">Setup plan</h2>
				{#if plan}
					<div class="mt-4 space-y-4 text-sm">
						<div>
							<p class="text-xs text-muted-foreground">Dashboard domain</p>
							<p class="font-mono text-foreground">{plan.dashboardDomain}</p>
						</div>
						<div>
							<p class="text-xs text-muted-foreground">DNS provider</p>
							<p class="text-foreground">{plan.dnsProvider}</p>
						</div>
						<div>
							<p class="mb-2 text-xs text-muted-foreground">Required records</p>
							{#each plan.requiredRecords as record}
								<div class="border border-border/60 p-2 font-mono text-xs text-foreground">
									{record.type}
									{record.name} → {record.value}
								</div>
							{/each}
						</div>
						<div class="space-y-2">
							{#each plan.nextSteps as step}
								<p class="flex gap-2 text-xs text-muted-foreground">
									<Check class="size-3.5 shrink-0 text-emerald-400" />
									{step}
								</p>
							{/each}
						</div>
					</div>
				{:else}
					<p class="mt-3 text-sm text-muted-foreground">
						Preview the plan to see the dashboard domain, records, and next steps.
					</p>
				{/if}
			</aside>
		</div>
	</div>
</main>
