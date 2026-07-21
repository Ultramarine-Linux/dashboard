import { dev } from '$app/environment';
import appStyles from '../../routes/layout.css?raw';
import { getRuntimeEnv } from '$lib/server/env';
import { instrument } from '$lib/server/observability';

type EmailRenderer = {
	render(
		component: unknown,
		options: { props?: Record<string, unknown> }
	): string | Promise<string>;
	toPlainText(html: string): string;
};

let emailRendererPromise: Promise<EmailRenderer> | undefined;

function getEmailRenderer(): Promise<EmailRenderer> {
	emailRendererPromise ??= import('@better-svelte-email/server').then(
		({ Renderer, toPlainText }) => {
			const renderer = new Renderer({ customCSS: appStyles });
			return {
				render: (component, options) => renderer.render(component, options),
				toPlainText
			};
		}
	);
	return emailRendererPromise;
}

type SendRenderedEmailParams = {
	component: unknown;
	props?: Record<string, unknown>;
	subject: string;
	to: string;
};
export async function renderEmail(component: unknown, props?: Record<string, unknown>) {
	const { render, toPlainText } = await getEmailRenderer();
	const html = await instrument('email.render', () => render(component, { props }));
	return { html, text: toPlainText(html) };
}

export async function emailToPlainText(html: string) {
	const { toPlainText } = await getEmailRenderer();
	return toPlainText(html);
}

type SendEmailParams = {
	subject: string;
	to: string;
	html: string;
	text: string;
};

export async function sendRenderedEmail({
	component,
	props,
	subject,
	to
}: SendRenderedEmailParams) {
	const { html, text } = await renderEmail(component, props);
	await sendEmail({ subject, to, html, text });
}

export async function sendEmail({ subject, to, text }: SendEmailParams) {
	getRuntimeEnv();

	if (!dev) {
		throw new Error('No email provider is configured for the self-hosted dashboard yet.');
	}

	console.info(`[Email skipped in dev]\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
}
