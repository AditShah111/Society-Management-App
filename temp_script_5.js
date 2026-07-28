
        async function logout() {
            try {
                await fetch('/api/logout', { method: 'POST' });
            } catch(e) {}
            window.location.href = '/login';
        }
    