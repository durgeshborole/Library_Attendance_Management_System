// in assistant.js
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');

    if(logoutBtn) {
        logoutBtn.addEventListener('click', (event) => {
            event.preventDefault();
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('userEmail'); // Use a generic key for email
            alert('You have been logged out.');
            window.location.href = 'index.html';
        });
    }
});