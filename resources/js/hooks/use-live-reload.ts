import { router } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

export function useLiveReload(
    projectId: number | string | undefined,
    intervalMs = 5000,
): void {
    const lastReloadAt = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!projectId) {
            return;
        }

        const reload = () => {
            lastReloadAt.current = Date.now();
            router.reload({ preserveScroll: true, preserveState: true } as any);
        };

        // Broadcasting is wired up, so refresh when the server says there is
        // something new, throttled to at most one reload per interval.
        if (window.Echo) {
            const schedule = () => {
                const elapsed = Date.now() - lastReloadAt.current;

                if (elapsed >= intervalMs) {
                    if (timer.current) {
                        clearTimeout(timer.current);
                        timer.current = null;
                    }

                    reload();

                    return;
                }

                if (!timer.current) {
                    timer.current = setTimeout(() => {
                        timer.current = null;
                        reload();
                    }, intervalMs - elapsed);
                }
            };

            const channel = window.Echo.private(`project.${projectId}`).listen(
                '.ProjectDataIngested',
                schedule,
            );

            return () => {
                if (timer.current) {
                    clearTimeout(timer.current);
                    timer.current = null;
                }

                channel.stopListening('.ProjectDataIngested');
            };
        }

        // No broadcaster configured: poll instead, so the dashboard still
        // refreshes on hosts that cannot run a WebSocket server. Hidden tabs
        // are skipped, so a dashboard left open in the background costs
        // nothing.
        const poll = setInterval(() => {
            if (document.visibilityState === 'visible') {
                reload();
            }
        }, intervalMs);

        return () => {
            clearInterval(poll);
        };
    }, [projectId, intervalMs]);
}
