document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('hod-login-form');
    const emailInput = document.getElementById('email');
    const passwordGroup = document.getElementById('password-group');
    const otpGroup = document.getElementById('otp-group');
    const submitBtn = document.getElementById('submit-btn');
    const statusMessage = document.getElementById('status-message');

    // State variable to track which step we are on
    let isAwaitingOtp = false;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        statusMessage.textContent = ''; // Clear previous messages
        
        if (!isAwaitingOtp) {
            // --- Step 1: Handle initial login with password ---
            const email = emailInput.value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/hod-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Login failed');
                }

                if (data.verificationRequired) {
                    // Transition to OTP verification step
                    isAwaitingOtp = true;
                    statusMessage.textContent = data.message;
                    statusMessage.className = 'status-message success';
                    
                    // Update UI for OTP entry
                    passwordGroup.style.display = 'none';
                    otpGroup.style.display = 'block';
                    emailInput.readOnly = true; // Lock the email field
                    submitBtn.textContent = 'Verify and Login';

                } else {
                    // Login successful, token received
                    sessionStorage.setItem('authToken', data.token);
                    window.location.href = '/hod-dashboard.html'; // Redirect to dashboard
                }

            } catch (err) {
                statusMessage.textContent = err.message;
                statusMessage.className = 'status-message error';
            }

        } else {
            // --- Step 2: Handle OTP verification ---
            const email = emailInput.value;
            const otp = document.getElementById('otp').value;

            try {
                const response = await fetch('/api/hod/verify-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, otp })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Verification failed');
                }
                
                // OTP verification successful, token received
                sessionStorage.setItem('authToken', data.token);
                window.location.href = '/hod-dashboard.html'; // Redirect to dashboard

            } catch (err) {
                statusMessage.textContent = err.message;
                statusMessage.className = 'status-message error';
            }
        }
    });
});

let isSubmitting = false;

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return; // ✅ Prevent double submission
    isSubmitting = true;

    try {
        // ... existing fetch logic here ...
    } catch (error) {
        messageEl.textContent = error.message;
    } finally {
        isSubmitting = false; // ✅ Reset after attempt
    }
});
