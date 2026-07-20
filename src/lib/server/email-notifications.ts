import SecurityAlertEmail from '$lib/emails/security-alert.svelte';
import { sendRenderedEmail } from '$lib/server/email';

type SecurityAlertEmailParams = {
	to: string;
	userName?: string | null;
	alertType: string;
	message: string;
	timestamp?: string;
	details?: string | null;
	actionUrl?: string | null;
};

function formatEmailTimestamp(date = new Date()) {
	return `${new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	}).format(date)} UTC`;
}

export function sendSecurityAlertEmail({
	to,
	userName,
	alertType,
	message,
	timestamp = formatEmailTimestamp(),
	details = null,
	actionUrl = null
}: SecurityAlertEmailParams) {
	return sendRenderedEmail({
		component: SecurityAlertEmail,
		props: { userName, alertType, message, timestamp, details, actionUrl },
		subject: `Security alert: ${alertType}`,
		to
	});
}
