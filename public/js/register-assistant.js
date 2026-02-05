// in register-assistant.js
document.getElementById('registerAssistantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const token = sessionStorage.getItem('authToken');

    try {
        const response = await fetch('/api/register-assistant', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();
        alert(result.message);
        if (response.ok) {
            document.getElementById('registerAssistantForm').reset();
        }
    } catch (error) {
        console.error('Error registering assistant:', error);
        alert('An error occurred. Please try again.');
    }
});