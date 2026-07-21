// Mirrors the headless planning contract in taidan::backend::server_setup.
// Keep this adapter narrow so it can later call a Taidan service/CLI directly.
export type SetupDomainMode = 'fyra_subdomain' | 'custom_domain';
export type SetupAccessMode = 'direct' | 'cloudflare_tunnel' | 'manual_tunnel';

export type SetupDomainInput = {
	domainMode: SetupDomainMode;
	rootDomain: string;
	accessMode: SetupAccessMode;
};

export type SetupPlan = {
	rootDomain: string;
	dashboardDomain: string;
	dnsProvider: 'fyra-cloudflare' | 'custom';
	accessMode: SetupAccessMode;
	requiredRecords: {
		type: 'A' | 'AAAA' | 'CNAME';
		name: string;
		value: string;
		proxied?: boolean;
	}[];
	nextSteps: string[];
};

function normalizeDomain(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/+$/, '');
}

function validateDomain(value: string) {
	const domain = normalizeDomain(value);
	if (!domain) throw new Error('Enter a domain.');
	if (domain.length > 253 || domain.includes('/') || domain.includes(':')) {
		throw new Error('Enter a valid domain name.');
	}
	if (
		!domain
			.split('.')
			.every((part) => part && part.length <= 63 && !part.startsWith('-') && !part.endsWith('-'))
	) {
		throw new Error('Enter a valid domain name.');
	}
	return domain;
}

function ensureFyraOneSubdomain(value: string) {
	const normalized = normalizeDomain(value);
	const rootDomain = normalized.endsWith('.fyra.one') ? normalized : `${normalized}.fyra.one`;
	if (rootDomain === 'fyra.one') throw new Error('Choose a subdomain under fyra.one.');
	return validateDomain(rootDomain);
}

export async function planDomainSetup(input: SetupDomainInput): Promise<SetupPlan> {
	const rootDomain =
		input.domainMode === 'fyra_subdomain'
			? ensureFyraOneSubdomain(input.rootDomain)
			: validateDomain(input.rootDomain);
	const dashboardDomain = `dash.${rootDomain}`;
	const dnsProvider = input.domainMode === 'fyra_subdomain' ? 'fyra-cloudflare' : 'custom';

	const requiredRecords: SetupPlan['requiredRecords'] =
		input.accessMode === 'cloudflare_tunnel'
			? [
					{
						type: 'CNAME',
						name: dashboardDomain,
						value: '<cloudflare-tunnel-id>.cfargotunnel.com',
						proxied: true
					}
				]
			: [
					{
						type: 'A',
						name: dashboardDomain,
						value: '<server-public-ip>',
						proxied: dnsProvider === 'fyra-cloudflare'
					}
				];

	return {
		rootDomain,
		dashboardDomain,
		dnsProvider,
		accessMode: input.accessMode,
		requiredRecords,
		nextSteps: [
			`Use ${dashboardDomain} for the dashboard.`,
			input.accessMode === 'direct'
				? 'Forward ports 80 and 443 to this server so Caddy can issue certificates.'
				: input.accessMode === 'cloudflare_tunnel'
					? 'Create a Cloudflare Tunnel connector before publishing tunnel CNAME records.'
					: 'Configure your tunnel or VPN provider to route HTTP(S) traffic to this server.',
			'The dashboard can use subdomains under this root for apps by default.'
		]
	};
}
