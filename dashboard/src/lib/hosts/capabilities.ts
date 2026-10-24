export type ModuleStatus = 'available' | 'planned';

export type CapabilityModule = {
	name: string;
	feature: string;
	description: string;
	status: ModuleStatus;
	actions: string[];
};

export type ParsedCapabilities = {
	modules: CapabilityModule[];
	/**
	 * True when the stored payload did not match the expected
	 * `{ modules: [...] }` shape from `agent.capabilities`. The caller should
	 * fall back to rendering the raw payload.
	 */
	raw: boolean;
};

/**
 * Parse a stored `agent.capabilities` response payload into a typed module
 * list. Defends against older agents, error payloads, or partially-shaped
 * responses by returning `raw: true` when the shape is unexpected.
 */
export function parseHostCapabilities(value: unknown): ParsedCapabilities {
	if (!value || typeof value !== 'object') return { modules: [], raw: true };
	const payload = value as Record<string, unknown>;
	const modulesField = payload['modules'];
	if (!Array.isArray(modulesField)) return { modules: [], raw: true };

	const modules: CapabilityModule[] = [];
	for (const entry of modulesField) {
		if (!entry || typeof entry !== 'object') continue;
		const record = entry as Record<string, unknown>;
		const name = typeof record['name'] === 'string' ? record['name'] : null;
		if (!name) continue;
		const actions = Array.isArray(record['actions'])
			? record['actions'].filter((action): action is string => typeof action === 'string')
			: [];
		modules.push({
			name,
			feature: typeof record['feature'] === 'string' ? record['feature'] : '',
			description: typeof record['description'] === 'string' ? record['description'] : '',
			status: record['status'] === 'planned' ? 'planned' : 'available',
			actions
		});
	}

	return { modules, raw: false };
}
