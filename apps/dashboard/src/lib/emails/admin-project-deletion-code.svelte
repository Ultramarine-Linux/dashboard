<script lang="ts">
	import {
		Body,
		Container,
		Head,
		Heading,
		Hr,
		Html,
		Preview,
		Section,
		Text
	} from '@better-svelte-email/components';
	import EmailHeader from './email-header.svelte';

	interface Props {
		userName?: string | null;
		projectName: string;
		code: string;
		expiresInMinutes: number;
	}

	let { userName = null, projectName, code, expiresInMinutes }: Props = $props();
</script>

<Html>
	<Head />
	<Body class="bg-gray-950 font-sans">
		<Preview preview="Confirm Ultramarine Server project deletion" />
		<Container class="mx-auto my-8 max-w-xl [border-radius:0] border border-gray-800 bg-gray-900">
			<EmailHeader label="Admin confirmation" />
			<Section class="p-8">
				<Heading as="h1" class="m-0 text-xl font-semibold text-gray-50">
					Confirm project deletion
				</Heading>
				<Text class="mt-4 text-sm leading-5 text-gray-400">
					{#if userName}Hi {userName},{:else}Hi there,{/if}
				</Text>
				<Text class="mt-2 text-sm leading-5 text-gray-400">
					Enter this code in Ultramarine Server to confirm deleting the project "{projectName}" and
					all of its resources.
				</Text>
				<Section class="mt-6 border border-gray-800 bg-gray-950 p-4">
					<Text class="m-0 font-mono text-2xl font-semibold tracking-widest text-gray-50">
						{code}
					</Text>
				</Section>
				<Hr class="my-8 border-gray-800" />
				<Text class="text-sm leading-5 text-gray-500">
					This code expires in {expiresInMinutes} minutes. If you did not request this deletion, contact
					support@ultramarine-linux.org and secure your account immediately.
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
