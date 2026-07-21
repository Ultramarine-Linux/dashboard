import { invalidate } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { getErrorMessage, runQuery } from '$lib/utils';
import {
	deleteUserWithVerification,
	getUserResources,
	listAdminUsers,
	setUserAdmin,
	setUserDisabled,
	setUserRole,
	setUserTwoFactor,
	type AdminUser,
	type UserAccount,
	type UserApiToken,
	type UserSession,
	type UserSshKey
} from '$lib/remote/admin-users.remote';

export type AdminUsersPageData = {
	adminUsers?: AdminUser[];
};

type UserResources = {
	sessions: UserSession[];
	accounts: UserAccount[];
	sshKeys: UserSshKey[];
	apiTokens: UserApiToken[];
};

export class AdminUsersState {
	adminUsers = $state<AdminUser[]>([]);
	adminUserSaving = $state<Record<string, boolean>>({});
	adminUserError = $state('');
	userSheetOpen = $state(false);
	selectedUser = $state<AdminUser | null>(null);
	userResources = $state<UserResources | null>(null);
	userResourcesLoading = $state(false);
	userResourcesError = $state('');

	constructor(data?: AdminUsersPageData) {
		if (data) this.sync(data);
	}

	sync(data: AdminUsersPageData) {
		this.adminUsers = data.adminUsers ?? [];
	}

	openUserSheet(user: AdminUser) {
		this.selectedUser = user;
		this.userSheetOpen = true;
		void this.loadUserResources(user.id);
	}

	closeUserSheet() {
		this.userSheetOpen = false;
		this.selectedUser = null;
		this.userResources = null;
		this.userResourcesError = '';
	}

	async loadUserResources(userId: string) {
		this.userResourcesLoading = true;
		this.userResourcesError = '';
		try {
			this.userResources = await runQuery(getUserResources({ userId }));
		} catch (err) {
			this.userResourcesError = getErrorMessage(err, 'Failed to load user resources');
		} finally {
			this.userResourcesLoading = false;
		}
	}

	async refreshUsers() {
		this.adminUsers = await runQuery(listAdminUsers(), 'admin.users');
		await invalidate('app:admin-users');
		await invalidate('app:admin-counts');
	}

	async setUserAdmin(userId: string, isAdmin: boolean) {
		this.adminUserSaving = { ...this.adminUserSaving, [userId]: true };
		try {
			await setUserAdmin({ userId, isAdmin });
			await this.refreshUsers();
		} catch (err) {
			toast.error(getErrorMessage(err, 'Failed to update admin role'));
		} finally {
			this.adminUserSaving = { ...this.adminUserSaving, [userId]: false };
		}
	}

	async setUserDisabled(userId: string, disabled: boolean) {
		this.adminUserSaving = { ...this.adminUserSaving, [userId]: true };
		try {
			await setUserDisabled({ userId, disabled });
			this.adminUsers = this.adminUsers.map((u) => (u.id === userId ? { ...u, disabled } : u));
			if (this.selectedUser?.id === userId) this.selectedUser = { ...this.selectedUser, disabled };
			await invalidate('app:admin-users');
		} catch (err) {
			toast.error(getErrorMessage(err, 'Failed to update user status'));
		} finally {
			this.adminUserSaving = { ...this.adminUserSaving, [userId]: false };
		}
	}

	async commit2FAConfirm(userId: string, twoFactorEnabled: boolean) {
		this.adminUserSaving = { ...this.adminUserSaving, [userId]: true };
		try {
			await setUserTwoFactor({ userId, twoFactorEnabled });
			this.adminUsers = this.adminUsers.map((u) =>
				u.id === userId ? { ...u, twoFactorEnabled } : u
			);
			if (this.selectedUser?.id === userId) {
				this.selectedUser = { ...this.selectedUser, twoFactorEnabled };
			}
			await invalidate('app:admin-users');
		} catch (err) {
			toast.error(getErrorMessage(err, 'Failed to update two-factor status'));
		} finally {
			this.adminUserSaving = { ...this.adminUserSaving, [userId]: false };
		}
	}

	async setUserRole(userId: string, role: string) {
		this.adminUserSaving = { ...this.adminUserSaving, [userId]: true };
		try {
			const result = await setUserRole({ userId, role });
			this.adminUsers = this.adminUsers.map((u) =>
				u.id === userId ? { ...u, role: result.role, isAdmin: result.isAdmin } : u
			);
			if (this.selectedUser?.id === userId) {
				this.selectedUser = { ...this.selectedUser, role: result.role, isAdmin: result.isAdmin };
			}
		} catch (err) {
			toast.error(getErrorMessage(err, 'Failed to update user role'));
		} finally {
			this.adminUserSaving = { ...this.adminUserSaving, [userId]: false };
		}
	}

	async deleteUser(userId: string, method: string, code?: string) {
		this.adminUserSaving = { ...this.adminUserSaving, [userId]: true };
		try {
			await deleteUserWithVerification({ userId, method, code });
			this.adminUsers = this.adminUsers.filter((u) => u.id !== userId);
			this.closeUserSheet();
			await invalidate('app:admin-users');
			await invalidate('app:admin-counts');
		} catch (err) {
			throw err;
		} finally {
			this.adminUserSaving = { ...this.adminUserSaving, [userId]: false };
		}
	}
}
