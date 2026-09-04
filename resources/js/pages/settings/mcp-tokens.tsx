import { Form, Head, usePage } from '@inertiajs/react';

import McpTokenController from '@/actions/App/Http/Controllers/Settings/McpTokenController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { index as mcpTokens } from '@/routes/mcp-tokens';
import type { SharedData } from '@/types';

type Token = {
    id: number;
    name: string;
    last_used_at: string | null;
    created_at: string;
};

type Flash = {
    mcpToken?: string | null;
};

export default function McpTokens({
    tokens,
    appUrl,
}: {
    tokens: Token[];
    appUrl: string;
}) {
    const { flash } = usePage<SharedData & { flash: Flash }>().props;

    return (
        <>
            <Head title="MCP Tokens" />

            <h1 className="sr-only">MCP Tokens</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="MCP Tokens"
                    description="Personal access tokens for connecting AI agents to laraowl over MCP."
                />

                {flash?.mcpToken && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-sm font-semibold">
                            Copy this token now — it won&apos;t be shown again.
                        </p>
                        <code className="mt-2 block text-xs break-all">
                            {flash.mcpToken}
                        </code>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Connect snippet:
                        </p>
                        <code className="mt-1 block text-xs break-all">
                            {`claude mcp add --transport http laraowl ${appUrl}/mcp --header "Authorization: Bearer ${flash.mcpToken}"`}
                        </code>
                    </div>
                )}

                <Form
                    {...McpTokenController.store.form()}
                    options={{ preserveScroll: true }}
                    resetOnSuccess
                    className="space-y-4"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Token name</Label>

                                <Input
                                    id="name"
                                    name="name"
                                    placeholder="My laptop"
                                />

                                <InputError message={errors.name} />
                            </div>

                            <Button type="submit" disabled={processing}>
                                Create token
                            </Button>
                        </>
                    )}
                </Form>

                {tokens.length > 0 && (
                    <ul className="divide-y divide-border">
                        {tokens.map((token) => (
                            <li
                                key={token.id}
                                className="flex items-center justify-between py-2"
                            >
                                <div>
                                    <span className="text-sm">
                                        {token.name}
                                    </span>
                                    {token.last_used_at && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            Last used{' '}
                                            {new Date(
                                                token.last_used_at,
                                            ).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>

                                <Form
                                    {...McpTokenController.destroy.form(
                                        token.id,
                                    )}
                                    options={{ preserveScroll: true }}
                                >
                                    {({ processing }) => (
                                        <Button
                                            type="submit"
                                            variant="ghost"
                                            size="sm"
                                            disabled={processing}
                                        >
                                            Revoke
                                        </Button>
                                    )}
                                </Form>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}

McpTokens.layout = {
    breadcrumbs: [
        {
            title: 'MCP Tokens',
            href: mcpTokens(),
        },
    ],
};
