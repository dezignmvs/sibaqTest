/**
 * Sibaq '26 Admin Authentication
 * Validates template credentials and redirects to admin dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const authForm = document.getElementById('authForm');
  const submitBtn = document.getElementById('submitBtn');
  const alertBanner = document.getElementById('alertBanner');

  // Input Fields
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const forgotLink = document.getElementById('forgotLink');

  // Error Containers
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');

  /* ==========================================================================
     Password Visibility Toggle
     ========================================================================== */
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      togglePasswordBtn.classList.toggle('active', isPassword);
    });
  }

  /* ==========================================================================
     Forgot Password Link Handling
     ========================================================================== */
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAlert('Password reset instructions sent to admin email.', 'success');
    });
  }

  /* ==========================================================================
     Form Validation & Submission
     ========================================================================== */
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function clearErrors() {
    if (emailError) {
      emailError.classList.remove('active');
      emailError.textContent = '';
    }
    if (passwordError) {
      passwordError.classList.remove('active');
      passwordError.textContent = '';
    }

    document.querySelectorAll('.input-wrapper').forEach((w) => w.classList.remove('error'));
  }

  function showAlert(message, type = 'error') {
    if (!alertBanner) return;
    alertBanner.textContent = message;
    alertBanner.className = `alert-banner ${type}`;
    alertBanner.style.display = 'block';
  }

  function hideAlert() {
    if (!alertBanner) return;
    alertBanner.style.display = 'none';
    alertBanner.className = 'alert-banner';
  }

  // Clear error highlight on input typing
  [emailInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      const wrapper = input.closest('.input-wrapper');
      if (wrapper) wrapper.classList.remove('error');
      const errEl = input.closest('.form-group')?.querySelector('.field-error');
      if (errEl) errEl.classList.remove('active');
    });
  });

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErrors();
      hideAlert();

      let hasError = false;

      // Validate Email or Registration ID
      const emailVal = emailInput.value.trim();
      if (!emailVal) {
        emailError.textContent = 'Please enter your admin email or ID.';
        emailError.classList.add('active');
        emailInput.closest('.input-wrapper').classList.add('error');
        hasError = true;
      } else if (emailVal.includes('@') && !validateEmail(emailVal)) {
        emailError.textContent = 'Please enter a valid email address.';
        emailError.classList.add('active');
        emailInput.closest('.input-wrapper').classList.add('error');
        hasError = true;
      }

      // Validate Password
      const passwordVal = passwordInput.value;
      if (!passwordVal) {
        passwordError.textContent = 'Password is required.';
        passwordError.classList.add('active');
        passwordInput.closest('.input-wrapper').classList.add('error');
        hasError = true;
      }

      if (hasError) return;

      // Simulated Authentication
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;

        const normalizedEmail = emailVal.toLowerCase();
        // Match template credentials
        if (normalizedEmail === 'zuhail@sibaq.com' && passwordVal === '340340') {
          // Save admin session
          sessionStorage.setItem('sibaq_auth', JSON.stringify({
            name: 'Zuhail',
            email: 'zuhail@sibaq.com',
            regId: 'SBQ-340340',
            role: 'Festival Administrator',
            category: 'Senior Arts',
            institution: 'Darul Huda Islamic University',
            loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));

          showAlert('Admin credentials verified! Loading dashboard...', 'success');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 500);
        } else {
          showAlert('Invalid admin email or password. Please try again.', 'error');
        }
      }, 700);
    });
  }
});
