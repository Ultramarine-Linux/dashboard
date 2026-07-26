import { invalidate } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { getErrorMessage } from '$lib/utils';
import {
	createSsoClient,
	deleteSsoClient,
	rotateSsoClientSecret,
	updateSsoClient,
	type SsoClient
} from '$lib/remote/sso-clients.remote';

export type AdminSsoPageData = {
	ssoClients?: SsoClient[];
};

export type SsoClientInput = {
	name: string;
	clientId?: string;
	type: string;
	redirectUrls: string;
	icon?: string;
	metadata?: string;
	disabled: boolean;
};

export class AdminSsoState {
	ssoClients = $state<SsoClient[]>([]);
	ssoClientSaving = $state<Record<string, boolean>>({});
	ssoClientError = $state('');
	newSsoClientSecret = $state<string | null>(null);

	constructor(data?: AdminSsoPageData) {
		if (data) this.sync(data);
	}

	sync(data: AdminSsoPageData) {
		this.ssoClients = data.ssoClients ?? [];
	}

	async createSsoClient(input: SsoClientInput) {
		this.ssoClientSaving = { ...this.ssoClientSaving, create: true };
		this.ssoClientError = '';
		this.newSsoClientSecret = null;
		try {
			const result = await createSsoClient(input);
			this.newSsoClientSecret = result.clientSecret ?? null;
			this.ssoClients = [result.client, ...this.ssoClients];
			await invalidate('app:sso-clients');
			await invalidate('app:admin-counts');
			toast.success('SSO client created');
			return result.client;
		} catch (err) {
			this.ssoClientError = getErrorMessage(err, 'Failed to create SSO client');
			throw err;
		} finally {
			this.ssoClientSaving = { ...this.ssoClientSaving, create: false };
		}
	}

	async updateSsoClient(id: string, input: Omit<SsoClientInput, 'clientId'>) {
		this.ssoClientSaving = { ...this.ssoClientSaving, [id]: true };
		this.ssoClientError = '';
		try {
			const updated = await updateSsoClient({ id, ...input });
			this.ssoClients = this.ssoClients.map((client) => (client.id === id ? updated : client));
			await invalidate('app:sso-clients');
			toast.success('SSO client updated');
		} catch (err) {
			this.ssoClientError = getErrorMessage(err, 'Failed to update SSO client');
			throw err;
		} finally {
			this.ssoClientSaving = { ...this.ssoClientSaving, [id]: false };
		}
	}

	async rotateSsoClientSecret(id: string) {
		this.ssoClientSaving = { ...this.ssoClientSaving, [`rotate:${id}`]: true };
		this.ssoClientError = '';
		this.newSsoClientSecret = null;
		try {
			const result = await rotateSsoClientSecret({ id });
			this.newSsoClientSecret = result.clientSecret ?? null;
			this.ssoClients = this.ssoClients.map((client) =>
				client.id === id ? result.client : client
			);
			toast.success('Client secret rotated');
		} catch (err) {
			this.ssoClientError = getErrorMessage(err, 'Failed to rotate client secret');
			throw err;
		} finally {
			this.ssoClientSaving = { ...this.ssoClientSaving, [`rotate:${id}`]: false };
		}
	}

	async deleteSsoClient(id: string) {
		this.ssoClientSaving = { ...this.ssoClientSaving, [`delete:${id}`]: true };
		this.ssoClientError = '';
		try {
			await deleteSsoClient({ id });
			this.ssoClients = this.ssoClients.filter((client) => client.id !== id);
			await invalidate('app:sso-clients');
			await invalidate('app:admin-counts');
			toast.success('SSO client deleted');
		} catch (err) {
			this.ssoClientError = getErrorMessage(err, 'Failed to delete SSO client');
			throw err;
		} finally {
			this.ssoClientSaving = { ...this.ssoClientSaving, [`delete:${id}`]: false };
		}
	}
}
