import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

if (typeof window !== 'undefined') {
    const pusherAppKey = import.meta.env.VITE_PUSHER_APP_KEY;

    // Baked in at build time by the CI build job. When it is absent the
    // dashboard still works, it simply never receives ProjectDataIngested
    // and so never live-reloads.
    if (pusherAppKey) {
        window.Pusher = Pusher;

        window.Echo = new Echo({
            broadcaster: 'pusher',
            key: pusherAppKey,
            cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER ?? 'mt1',
            forceTLS: true,
            enabledTransports: ['ws', 'wss'],
        });
    }
}
