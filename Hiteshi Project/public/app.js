const API_URL = `${window.location.origin}/api`;

const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  notes: [],
  topics: [],
  currentNote: null,
  comments: []
};

let googleClientIdPromise = null;
let pendingVerificationEmail = localStorage.getItem('pendingVerificationEmail') || '';
const GOOGLE_DEBUG = true; // Temporary diagnostics; remove after confirmation.

function googleDebug(step, details = {}) {
  if (!GOOGLE_DEBUG) return;
  try {
    console.log('[GoogleAuthDebug]', step, details);
  } catch (_) {
    // no-op
  }
}

function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {};
  if (state.token) headers['x-auth-token'] = state.token;
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (body) body = JSON.stringify(body);
  }
  
  const options = { method, headers, body };
  if (!body) delete options.body;

  let res;
  try {
    res = await fetch(`${API_URL}${endpoint}`, options);
  } catch (networkErr) {
    throw new Error(`Network error while calling ${endpoint}. Check backend/server connection.`);
  }
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (isJson && data && data.msg) throw new Error(data.msg);
    if (typeof data === 'string' && data.trim().startsWith('<')) {
      throw new Error(`Server returned HTML instead of JSON for ${endpoint}. Open app from backend origin and restart server.`);
    }

    const text = typeof data === 'string' ? data.trim() : '';
    const snippet = text ? ` - ${text.slice(0, 120)}` : '';
    throw new Error(`API Error (${res.status}) on ${endpoint}${snippet}`);
  }

  if (!isJson) {
    throw new Error('Server returned a non-JSON response.');
  }

  return data;
}

function persistAuth(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  clearPendingVerificationEmail();
}

function setPendingVerificationEmail(email) {
  pendingVerificationEmail = email || '';
  if (pendingVerificationEmail) localStorage.setItem('pendingVerificationEmail', pendingVerificationEmail);
}

function clearPendingVerificationEmail() {
  pendingVerificationEmail = '';
  localStorage.removeItem('pendingVerificationEmail');
}

async function getGoogleClientId() {
  googleDebug('getGoogleClientId:start', { hasPromise: !!googleClientIdPromise });
  if (!googleClientIdPromise) {
    googleClientIdPromise = apiCall('/auth/google-config')
      .then((data) => {
        const clientId = data.clientId || '';
        googleDebug('getGoogleClientId:success', { hasClientId: !!clientId, clientIdPreview: clientId ? `${clientId.slice(0, 12)}...` : '' });
        return clientId;
      })
      .catch((err) => {
        googleDebug('getGoogleClientId:error', { message: err.message });
        return '';
      });
  }
  return googleClientIdPromise;
}

async function renderGoogleButton(containerId, mode) {
  const container = document.getElementById(containerId);
  googleDebug('renderGoogleButton:container', { containerId, mode, found: !!container });
  if (!container) return;

  const clientId = await getGoogleClientId();
  googleDebug('renderGoogleButton:clientId', { hasClientId: !!clientId });
  if (!clientId) {
    container.innerHTML = '<p class="google-auth-note">Google sign-in is not configured yet.</p>';
    googleDebug('renderGoogleButton:missingClientId');
    return;
  }

  googleDebug('renderGoogleButton:gsiAvailability', {
    hasGoogle: !!window.google,
    hasAccounts: !!(window.google && window.google.accounts),
    hasId: !!(window.google && window.google.accounts && window.google.accounts.id)
  });
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    container.innerHTML = '<p class="google-auth-note">Google sign-in is loading. Please wait a moment.</p>';
    googleDebug('renderGoogleButton:gsiNotReady');
    return;
  }

  googleDebug('renderGoogleButton:initialize:start', { mode });
  window.google.accounts.id.initialize({
    client_id: clientId,
    auto_select: false,
    callback: async (response) => {
      googleDebug('renderGoogleButton:callback', { hasCredential: !!(response && response.credential) });
      try {
        const data = await apiCall('/auth/google', 'POST', {
          credential: response.credential
        });
        
        if (data.requiresOtp) {
          showToast(data.msg);
          setPendingVerificationEmail(data.email);
          setTimeout(() => window.location.hash = '#/verify-otp', 1500);
          return;
        }

        persistAuth(data);
        showToast('Signed in with Google');
        googleDebug('renderGoogleButton:signinSuccess', { userId: data && data.user ? data.user.id : null });
        window.location.hash = '#/';
      } catch (err) {
        googleDebug('renderGoogleButton:signinError', { message: err.message });
        showToast(err.message, true);
        if (err.message.includes('verify your email')) {
          setPendingVerificationEmail(err.email || ''); // Best effort if email isn't in err
          setTimeout(() => window.location.hash = '#/verify-otp', 1500);
        }
      }
    }
  });

  container.innerHTML = '';
  googleDebug('renderGoogleButton:render:start', { width: Math.min(container.offsetWidth || 320, 360), mode });
  window.google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    width: Math.min(container.offsetWidth || 320, 360),
    text: mode === 'register' ? 'signup_with' : 'signin_with'
  });
  googleDebug('renderGoogleButton:render:done');
}

function navigate() {
  const hash = window.location.hash || '#/';
  const app = document.getElementById('app');
  
  if (!state.token || !state.user) {
    if (state.token || state.user) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    if (hash === '#/') { renderLandingPage(app); return; }
    if (hash === '#/login') { renderLogin(app); return; }
    if (hash === '#/register') { renderRegister(app); return; }
    if (hash === '#/verify-otp') { renderOtpVerification(app); return; }
    
    window.location.hash = '#/login';
    return;
  }

  if (hash === '#/login' || hash === '#/register' || hash === '#/verify-otp') {
    window.location.hash = '#/';
    return;
  }

  if (hash === '#/') renderDashboard(app);
  else if (hash === '#/settings') renderSettings(app);
  else if (hash === '#/search') renderSearch(app);
  else if (hash.startsWith('#/profile/')) {
    const id = hash.split('/')[2];
    renderProfile(app, id);
  }
  else if (hash.startsWith('#/note/')) {
    const id = hash.split('/')[2];
    if (id === 'new') renderEditor(app, null);
    else renderEditor(app, id);
  } else {
    renderDashboard(app);
  }
}

function renderOtpVerification(app) {
  const accent = '#ff4e00';
  const emailText = pendingVerificationEmail || 'your email';

  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050505; position: relative; overflow: hidden; font-family: 'Inter', sans-serif;">
      <div class="auth-glow" style="position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,78,0,0.12) 0%, rgba(0,0,0,0) 70%); top: -150px; left: -150px; border-radius: 50%; pointer-events: none;"></div>
      <div class="auth-glow" style="position: absolute; width: 500px; height: 500px; background: radial-gradient(circle, rgba(0,180,255,0.08) 0%, rgba(0,0,0,0) 70%); bottom: -100px; right: -100px; border-radius: 50%; pointer-events: none;"></div>
      <div class="auth-box-gsap" style="width: 100%; max-width: 420px; padding: 50px 40px; background: rgba(20,20,20,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; z-index: 10; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center;">
        <div style="font-size: 2.2rem; font-weight: 800; color: #fff; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
          <i class="fa-solid fa-shield-halved" style="color: ${accent}"></i> Verify OTP
        </div>
        <p style="color: #888; font-size: 0.95rem; margin-bottom: 28px;">Enter the 6-digit code sent to <span style="color:#fff;">${emailText}</span></p>
        <form id="otp-form" style="display: flex; flex-direction: column; gap: 20px;">
          <div class="auth-input-gsap" style="position: relative;">
            <i class="fa-solid fa-key" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
            <input type="text" id="otp" placeholder="6-digit OTP" maxlength="6" required style="width: 100%; box-sizing: border-box; letter-spacing: 6px; text-align:center; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 1rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
          </div>
          <button class="auth-btn-gsap" type="submit" style="width: 100%; background: ${accent}; color: #fff; border: none; padding: 16px; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer;">
            Verify Email
          </button>
        </form>
        <div style="display:flex; justify-content:space-between; gap:12px; margin-top:22px; flex-wrap:wrap;">
          <button id="resend-otp-btn" class="btn btn-secondary" style="justify-content:center; flex:1;">Resend OTP</button>
          <button id="back-register-btn" class="btn btn-secondary" style="justify-content:center; flex:1;">Back</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingVerificationEmail) {
      showToast('Please register first to receive an OTP.', true);
      window.location.hash = '#/register';
      return;
    }

    try {
      const data = await apiCall('/auth/verify-otp', 'POST', {
        email: pendingVerificationEmail,
        otp: document.getElementById('otp').value
      });
      persistAuth(data);
      showToast('Email verified successfully');
      window.location.hash = '#/';
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('resend-otp-btn').addEventListener('click', async () => {
    if (!pendingVerificationEmail) {
      showToast('Please register first to receive an OTP.', true);
      window.location.hash = '#/register';
      return;
    }

    try {
      const data = await apiCall('/auth/resend-otp', 'POST', { email: pendingVerificationEmail });
      showToast(data.msg || 'OTP resent');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('back-register-btn').addEventListener('click', () => {
    window.location.hash = '#/register';
  });
}

window.addEventListener('hashchange', navigate);

function renderLogin(app) {
  const accent = '#ff4e00';
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050505; position: relative; overflow: hidden; font-family: 'Inter', sans-serif;">
       <!-- Background Glow -->
       <div class="auth-glow" style="position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,78,0,0.12) 0%, rgba(0,0,0,0) 70%); top: -150px; left: -150px; border-radius: 50%; pointer-events: none;"></div>
       <div class="auth-glow" style="position: absolute; width: 500px; height: 500px; background: radial-gradient(circle, rgba(90,0,255,0.08) 0%, rgba(0,0,0,0) 70%); bottom: -100px; right: -100px; border-radius: 50%; pointer-events: none;"></div>
       
       <div class="auth-box-gsap" style="width: 100%; max-width: 420px; padding: 50px 40px; background: rgba(20,20,20,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; z-index: 10; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center;">
          
          <div style="font-size: 2.2rem; font-weight: 800; color: #fff; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
             <i class="fa-solid fa-flask" style="color: ${accent}"></i> Nexus
          </div>
          <p style="color: #888; font-size: 0.95rem; margin-bottom: 40px;">Sign in to your Research Hub</p>
          
          <form id="login-form" style="display: flex; flex-direction: column; gap: 20px;">
            <div class="auth-input-gsap" style="position: relative;">
               <i class="fa-solid fa-envelope" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
               <input type="email" id="email" placeholder="Email Address" required style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 0.95rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
            </div>
            <div class="auth-input-gsap" style="position: relative;">
               <i class="fa-solid fa-lock" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
               <input type="password" id="password" placeholder="Password" required style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 0.95rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
            </div>
            
            <button class="auth-btn-gsap" type="submit" style="width: 100%; background: ${accent}; color: #fff; border: none; padding: 16px; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; margin-top: 10px; transition: transform 0.2s, opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
               Sign In <i class="fa-solid fa-arrow-right" style="margin-left: 8px;"></i>
            </button>
          </form>
          <div class="google-auth-divider"><span>or continue with</span></div>
          <div id="google-login-button" class="google-auth-button"></div>
          
          <p class="auth-bot-gsap" style="margin-top: 30px; font-size: 0.9rem; color: #666;">
             Don't have an account? <a href="#/register" style="color: ${accent}; text-decoration: none; font-weight: 600;">Register Now</a>
          </p>
          <div onclick="window.location.hash='#/'" style="margin-top: 20px; font-size: 0.85rem; color: #555; cursor:pointer; text-decoration: underline;">Back to Home page</div>
       </div>
    </div>
  `;

  setTimeout(() => {
     if(window.gsap) {
        gsap.fromTo(".auth-glow", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 1.5, ease: "power3.out", stagger: 0.2 });
        gsap.fromTo(".auth-box-gsap", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" });
        gsap.fromTo(".auth-input-gsap", { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, stagger: 0.1, delay: 0.2, ease: "power2.out" });
        gsap.fromTo(".auth-btn-gsap", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: 0.4, ease: "power2.out" });
        gsap.fromTo(".auth-bot-gsap", { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.6 });
     }
  }, 50);

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiCall('/auth/login', 'POST', {
        email: e.target.email.value,
        password: e.target.password.value
      });
      persistAuth(data);
      showToast('Logged in successfully');
      window.location.hash = '#/';
    } catch (err) {
      showToast(err.message, true);
      if (err.message.includes('verify your email')) {
        setPendingVerificationEmail(e.target.email.value);
        setTimeout(() => window.location.hash = '#/verify-otp', 1500);
      }
    }
  });

  renderGoogleButton('google-login-button', 'login');
}

function renderRegister(app) {
  const accent = '#ff4e00';
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #050505; position: relative; overflow: hidden; font-family: 'Inter', sans-serif;">
       <!-- Background Glow -->
       <div class="auth-glow" style="position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,78,0,0.12) 0%, rgba(0,0,0,0) 70%); top: -150px; right: -150px; border-radius: 50%; pointer-events: none;"></div>
       <div class="auth-glow" style="position: absolute; width: 500px; height: 500px; background: radial-gradient(circle, rgba(0,180,255,0.08) 0%, rgba(0,0,0,0) 70%); bottom: -100px; left: -100px; border-radius: 50%; pointer-events: none;"></div>
       
       <div class="auth-box-gsap" style="width: 100%; max-width: 420px; padding: 50px 40px; background: rgba(20,20,20,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; z-index: 10; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center;">
          
          <div style="font-size: 2.2rem; font-weight: 800; color: #fff; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
             <i class="fa-solid fa-flask" style="color: ${accent}"></i> Nexus
          </div>
          <p style="color: #888; font-size: 0.95rem; margin-bottom: 40px;">Create your workspace account</p>
          
          <form id="register-form" style="display: flex; flex-direction: column; gap: 20px;">
            <div class="auth-input-gsap" style="position: relative;">
               <i class="fa-solid fa-user" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
               <input type="text" id="name" placeholder="Full Name" required style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 0.95rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
            </div>
            <div class="auth-input-gsap" style="position: relative;">
               <i class="fa-solid fa-envelope" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
               <input type="email" id="email" placeholder="Email Address" required style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 0.95rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
            </div>
            <div class="auth-input-gsap" style="position: relative;">
               <i class="fa-solid fa-lock" style="position: absolute; left: 16px; top: 18px; color: #666; font-size: 0.9rem;"></i>
               <input type="password" id="password" placeholder="Password" required style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 16px 20px 16px 44px; border-radius: 12px; outline: none; font-size: 0.95rem; transition: border 0.3s;" onfocus="this.style.borderColor='${accent}'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
            </div>
            
            <button class="auth-btn-gsap" type="submit" style="width: 100%; background: #fff; color: #000; border: none; padding: 16px; border-radius: 12px; font-weight: 700; font-size: 1rem; cursor: pointer; margin-top: 10px; transition: transform 0.2s, opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
               Create Account
            </button>
          </form>
          <div class="google-auth-divider"><span>or continue with</span></div>
          <div id="google-register-button" class="google-auth-button"></div>
          
          <p class="auth-bot-gsap" style="margin-top: 30px; font-size: 0.9rem; color: #666;">
             Already have an account? <a href="#/login" style="color: #fff; text-decoration: none; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.3);">Login Here</a>
          </p>
          <div onclick="window.location.hash='#/'" style="margin-top: 20px; font-size: 0.85rem; color: #555; cursor:pointer; text-decoration: underline;">Back to Home page</div>
       </div>
    </div>
  `;

  setTimeout(() => {
     if(window.gsap) {
        gsap.fromTo(".auth-glow", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 1.5, ease: "power3.out", stagger: 0.2 });
        gsap.fromTo(".auth-box-gsap", { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.5)" });
        gsap.fromTo(".auth-input-gsap", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, delay: 0.2, ease: "power2.out" });
        gsap.fromTo(".auth-btn-gsap", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.5, ease: "power2.out" });
        gsap.fromTo(".auth-bot-gsap", { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.6 });
     }
  }, 50);

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiCall('/auth/register', 'POST', {
        name: e.target.name.value,
        email: e.target.email.value,
        password: e.target.password.value
      });
      if (data && data.token) {
        persistAuth(data);
        showToast('Account created successfully');
        window.location.hash = '#/';
        return;
      }

      setPendingVerificationEmail(data.email || e.target.email.value);
      showToast(data.msg || 'OTP sent to your email');
      if (data.requiresOtp) {
        window.location.hash = '#/verify-otp';
      } else {
        window.location.hash = '#/login';
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });

  renderGoogleButton('google-register-button', 'register');
}

function getLayout(contentHTML) {
  return `
    <div class="layout">
      <div class="sidebar">
        <div class="logo">
          <i class="fa-solid fa-flask"></i> Nexus
        </div>
        <ul class="nav-menu">
          <li class="nav-item ${window.location.hash === '#/' ? 'active' : ''}" onclick="window.location.hash='#/'">
            <i class="fa-solid fa-house"></i> Dashboard
          </li>
          <li class="nav-item" onclick="window.location.hash='#/note/new'">
            <i class="fa-solid fa-plus"></i> New Note
          </li>
          <li class="nav-item ${window.location.hash.startsWith('#/profile') ? 'active' : ''}" onclick="window.location.hash='#/profile/${state.user.id || state.user._id}'">
            <i class="fa-solid fa-user"></i> Profile
          </li>
          <li class="nav-item ${window.location.hash === '#/search' ? 'active' : ''}" onclick="window.location.hash='#/search'">
            <i class="fa-solid fa-users"></i> Search Users
          </li>
          <li class="nav-item ${window.location.hash === '#/settings' ? 'active' : ''}" onclick="window.location.hash='#/settings'">
            <i class="fa-solid fa-gear"></i> Settings
          </li>
          <li class="nav-item" onclick="toggleTopicModal()">
            <i class="fa-solid fa-folder-plus"></i> New Topic
          </li>
          <li class="nav-item" onclick="logout()" style="margin-top: auto; color: var(--accent);">
            <i class="fa-solid fa-right-from-bracket"></i> Logout
          </li>
        </ul>
      </div>
      <div class="main-content">
        ${contentHTML}
      </div>
    </div>
    
    <div class="modal-overlay" id="topic-modal">
      <div class="glass-panel modal-content">
        <h2 style="margin-bottom: 16px;">Create Topic</h2>
        <form id="topic-form">
          <input type="text" id="topic-name" class="input-field" placeholder="Topic Name" required>
          <input type="text" id="topic-desc" class="input-field" placeholder="Description">
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="toggleTopicModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.toggleTopicModal = () => {
    const modal = document.getElementById('topic-modal');
    if(modal) modal.classList.toggle('active');
};

window.logout = () => {
  const googleUserEmail = state.user && state.user.authProvider === 'google' ? state.user.email : null;

  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  clearPendingVerificationEmail();

  // Prevent Google Identity from auto-signing user back in.
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
    if (googleUserEmail) {
      window.google.accounts.id.revoke(googleUserEmail, () => {});
    }
  }

  // Hash won't trigger hashchange if already at "#/".
  if (window.location.hash !== '#/') {
    window.location.hash = '#/';
  } else {
    navigate();
  }
};

async function renderDashboard(app) {
  app.innerHTML = getLayout(`
    <div class="header">
      <div>
        <h1 style="color: var(--text-light);">Research Notes</h1>
        <p>Welcome back, ${state.user ? state.user.name : ''}</p>
      </div>
      <div class="search-bar">
        <i class="fa-solid fa-search"></i>
        <input type="text" id="search-input" placeholder="Search notes...">
      </div>
    </div>
    <div class="dashboard-grid" id="notes-grid">
      <!-- Notes go here -->
    </div>
  `);

  document.getElementById('search-input').addEventListener('input', async (e) => {
    const q = e.target.value;
    if (q.length > 2) {
      try {
        state.notes = await apiCall(`/search?q=${q}`);
        renderNotesList();
      } catch (err) { }
    } else if (q.length === 0) {
      loadNotes();
    }
  });

  loadNotes();

  const tf = document.getElementById('topic-form');
  if(tf) {
      tf.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
              await apiCall('/topics', 'POST', {
                  name: e.target['topic-name'].value,
                  description: e.target['topic-desc'].value
              });
              toggleTopicModal();
              showToast('Topic created!');
              e.target.reset();
          } catch(err) {
              showToast(err.message, true);
          }
      });
  }
}

async function loadNotes() {
  try {
    state.notes = await apiCall('/notes');
    renderNotesList();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderNotesList() {
  const grid = document.getElementById('notes-grid');
  if (!grid) return;
  
  if (state.notes.length === 0) {
    grid.innerHTML = '<p>No research notes found. Create a new note to start.</p>';
    return;
  }

  grid.innerHTML = state.notes.map(note => `
    <div class="glass-panel note-card" onclick="window.location.hash='#/note/${note._id}'">
      <div class="badges" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          ${note.topic ? `<span class="badge">${note.topic.name}</span>` : ''}
          <span class="badge" style="background: rgba(122, 162, 247, 0.2); color: var(--primary);">v${note.currentVersion}</span>
        </div>
        <div>
          ${note.isPublic ? '<i class="fa-solid fa-globe" style="color:var(--primary)" title="Public"></i>' : '<i class="fa-solid fa-lock" style="color:#666" title="Private"></i>'}
        </div>
      </div>
      <h3 style="margin-top: 10px;">${note.title}</h3>
      <p>${note.content.replace(/<[^>]*>?/gm, '').substring(0, 100)}...</p>
      <div class="note-meta" style="display:flex; justify-content:space-between; align-items: center; margin-top: 20px;">
        <span>${new Date(note.updatedAt).toLocaleDateString()}</span>
        <div style="display:flex; gap:16px; font-size:1.1rem;">
           <span title="Likes"><i class="fa-solid fa-heart" onclick="event.stopPropagation(); toggleLike('${note._id}')" style="cursor:pointer; color:${note.likes && note.likes.includes(state.user.id || state.user._id)?'var(--accent)':'#666'}; transition: color 0.3s;"></i> <span style="font-size:0.8rem; color:#aaa;">${note.likes ? note.likes.length : 0}</span></span>
           <span title="Save Note"><i class="fa-solid fa-bookmark" onclick="event.stopPropagation(); toggleSave('${note._id}')" style="cursor:pointer; color:${state.user.savedNotes && state.user.savedNotes.some(s => s === note._id || s._id === note._id)?'var(--primary)':'#666'}; transition: color 0.3s;"></i></span>
        </div>
      </div>
    </div>
  `).join('');
}

async function renderEditor(app, noteId) {
  let note = { title: '', content: '', topic: '' };
  
  try {
    state.topics = await apiCall('/topics');
    if (noteId) {
      note = await apiCall(`/notes/${noteId}`);
      state.currentNote = note;
      state.comments = await apiCall(`/comments/${noteId}`);
    } else {
      state.currentNote = null;
    }
  } catch (err) {
    showToast(err.message, true);
    return;
  }

  let isOwner = true;
  if(noteId && state.currentNote) {
     const cid = state.currentNote.createdBy && (state.currentNote.createdBy._id || state.currentNote.createdBy);
     // Compare ignoring type in case they are string vs objectId
     isOwner = (cid == state.user.id) || (cid == state.user._id);
  }

  app.innerHTML = getLayout(`
    <div class="split-view">
      <div class="note-area glass-panel" style="padding: 32px;">
        <div class="editor-header">
          ${isOwner ? `
          <select id="topic-select" class="input-field" style="width: auto; margin-bottom: 0;">
            <option value="">Select Topic</option>
            ${state.topics.map(t => `<option value="${t._id}" ${note.topic && note.topic._id === t._id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
          ` : `
          <div style="font-size: 1.1rem; color: var(--primary); font-weight: 600;">${note.topic ? note.topic.name : 'Uncategorized'}</div>
          `}
          <div style="display: flex; gap: 12px; align-items:center;">
            ${isOwner ? `
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-light); font-size:0.9rem;">
              <input type="checkbox" id="note-is-public" ${note.isPublic ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer; accent-color: var(--primary);"> Make Public
            </label>
            ` : ''}
            <button class="btn btn-secondary" onclick="window.location.hash='#/'">Back</button>
            ${isOwner ? `<button class="btn btn-primary" id="save-note-btn">Save Note</button>` : ''}
          </div>
        </div>
        
        <input type="text" id="note-title" class="editor-title" placeholder="Research Title..." value="${note.title}" ${isOwner ? '' : 'readonly'}>
        
        ${isOwner ? `
        <div class="glass-panel" style="margin-bottom: 24px; padding: 12px; display: flex; gap: 8px; border-radius: 8px 8px 0 0; border-bottom: none;">
            <button class="btn btn-secondary" onclick="document.execCommand('bold', false, null)" style="padding: 4px 10px;"><i class="fa-solid fa-bold"></i></button>
            <button class="btn btn-secondary" onclick="document.execCommand('italic', false, null)" style="padding: 4px 10px;"><i class="fa-solid fa-italic"></i></button>
            <button class="btn btn-secondary" onclick="document.execCommand('underline', false, null)" style="padding: 4px 10px;"><i class="fa-solid fa-underline"></i></button>
            <button class="btn btn-secondary" onclick="document.execCommand('insertUnorderedList', false, null)" style="padding: 4px 10px;"><i class="fa-solid fa-list-ul"></i></button>
            <button class="btn btn-secondary" onclick="document.execCommand('insertOrderedList', false, null)" style="padding: 4px 10px;"><i class="fa-solid fa-list-ol"></i></button>
        </div>
        ` : ''}
        <div id="note-content" class="editor-content glass-panel" contenteditable="${isOwner ? 'true' : 'false'}" placeholder="Start typing your research findings..." style="border-radius: ${isOwner ? '0 0 8px 8px; margin-top: -24px;' : '8px; margin-top: 24px;'}">${note.content}</div>

        ${noteId ? `
        <div style="margin-top: 32px;">
            <h3>Attachments</h3>
            <ul style="list-style: none; margin-top: 12px; margin-bottom: 12px;">
                ${note.attachments ? note.attachments.map(a => `<li><a href="/uploads/${a.path}" target="_blank" style="color: var(--secondary);"><i class="fa-solid fa-paperclip"></i> ${a.filename}</a></li>`).join('') : 'No attachments'}
            </ul>
            ${isOwner ? `<input type="file" id="note-attachments" multiple class="input-field" style="margin-top: 8px;">` : ''}
        </div>
        ` : ''}
        
      </div>
      
      ${noteId ? `
      <div class="comments-sidebar">
        <h3>Collaborator Comments</h3>
        <div id="comments-list" style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto;">
          ${state.comments.map(c => `
            <div class="comment-box">
              <div class="comment-header">
                <span>${c.author.name}</span>
                <span>${new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
              <p style="font-size: 0.9rem;">${c.content}</p>
            </div>
          `).join('')}
        </div>
        <form id="comment-form" style="margin-top: 16px;">
          <textarea id="comment-content" class="input-field" placeholder="Add a comment..." required style="min-height: 80px; resize: none;"></textarea>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Post Comment</button>
        </form>
      </div>
      ` : ''}
    </div>
  `);

  const saveBtn = document.getElementById('save-note-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('note-title').value;
      const content = document.getElementById('note-content').innerHTML;
      const topic = document.getElementById('topic-select') ? document.getElementById('topic-select').value : null;
      const isPublic = document.getElementById('note-is-public') ? document.getElementById('note-is-public').checked : false;
    
    if (!title || !content) {
        showToast('Title and content are required', true);
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('isPublic', isPublic);
    if (topic) formData.append('topic', topic);

    if (noteId) {
        const fileInput = document.getElementById('note-attachments');
        if (fileInput && fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('attachments', fileInput.files[i]);
            }
        }
    }

    try {
        const endpoint = noteId ? `/notes/${noteId}` : '/notes';
        const method = noteId ? 'PUT' : 'POST';

        const data = await apiCall(endpoint, method, formData);
        
        showToast('Note saved successfully');
        if (!noteId) window.location.hash = `#/note/${data._id}`;
        else {
            state.currentNote = data;
            renderEditor(app, data._id);
        }
    } catch(err) {
        showToast(err.message, true);
    }
    });
  }

  const commentForm = document.getElementById('comment-form');
  if (commentForm) {
      commentForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
              const res = await apiCall(`/comments/${noteId}`, 'POST', {
                  content: e.target['comment-content'].value
              });
              state.comments.push(res);
              renderEditor(app, noteId);
              showToast('Comment added');
          } catch(err) {
              showToast(err.message, true);
          }
      });
  }

  const tf = document.getElementById('topic-form');
  if(tf) {
      tf.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
              await apiCall('/topics', 'POST', {
                  name: e.target['topic-name'].value,
                  description: e.target['topic-desc'].value
              });
              toggleTopicModal();
              showToast('Topic created!');
              e.target.reset();
              renderEditor(app, noteId);
          } catch(err) {
              showToast(err.message, true);
          }
      });
  }
}

function renderLandingPage(app) {
  const accent = "#ff4e00";
  const bg = "#0a0a0a";
  const cardBg = "#111111";

  app.innerHTML = `
    <div class="ns-landing" style="min-height: 100vh; background: ${bg}; color: #fff; font-family: 'Inter', sans-serif; overflow-x: hidden;">
      
      <!-- Navbar -->
      <nav style="position: fixed; top: 0; width: 100%; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; z-index: 100; background: rgba(10,10,10,0.8); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div style="font-size: 1.8rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
             <i class="fa-solid fa-flask"></i> Nexus
          </div>
          
          <div style="display: flex; gap: 32px; background: #161616; border: 1px solid rgba(255,255,255,0.1); padding: 12px 32px; border-radius: 40px; font-size: 0.95rem; font-weight: 500; color: #ccc;">
              <div onclick="document.getElementById('explore')?.scrollIntoView({behavior:'smooth'})" style="cursor:pointer; color:#fff; transition: color 0.3s;">Explore</div>
              <div onclick="document.getElementById('features')?.scrollIntoView({behavior:'smooth'})" style="cursor:pointer; transition: color 0.3s;">Features</div>
              <div onclick="document.getElementById('testimonials')?.scrollIntoView({behavior:'smooth'})" style="cursor:pointer; transition: color 0.3s;">Testimonials</div>
              <div onclick="document.getElementById('faqs')?.scrollIntoView({behavior:'smooth'})" style="cursor:pointer; transition: color 0.3s;">FAQs</div>
          </div>

          <div style="display: flex; gap: 24px; align-items: center;">
            <i id="btn-theme-toggle" class="fa-solid fa-moon" style="color: #666; cursor: pointer; font-size: 1.2rem;"></i>
            <span onclick="window.location.hash='#/login'" style="font-weight: 600; font-size: 0.95rem; cursor:pointer;">Login Hub</span>
            <button onclick="window.location.hash='#/register'" style="background: ${accent}; color: #fff; border: none; font-size: 0.95rem; font-weight: 700; cursor: pointer; padding: 14px 28px; border-radius: 30px; transition: transform 0.2s, box-shadow 0.2s;">Get Started</button>
          </div>
      </nav>

      <!-- Hero Section -->
      <section id="explore" style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 150px 20px 80px; position: relative;">
          <!-- Subtle Glow -->
          <div style="position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,78,0,0.05) 0%, rgba(0,0,0,0) 70%); top: 40%; left: 50%; transform: translate(-50%, -50%); z-index: 0; pointer-events: none;"></div>

          <div class="gsap-hero-badge" style="z-index: 10; background: #1c1510; border: 1px solid rgba(255,78,0,0.2); padding: 8px 20px; border-radius: 30px; color: ${accent}; font-weight: 600; font-size: 0.9rem; margin-bottom: 30px; display: inline-flex; align-items: center; gap: 8px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: ${accent};"></div> Live across 10+ Universities
          </div>

          <h1 class="gsap-hero-title" style="font-size: clamp(4rem, 8vw, 6.5rem); font-weight: 800; line-height: 1.05; margin-bottom: 24px; letter-spacing: -2px; z-index: 10;">
             Don't Just Analyze.<br>
             <span style="color: ${accent};">Research It.</span>
          </h1>

          <p class="gsap-hero-sub" style="font-size: 1.25rem; color: #999; max-width: 650px; margin-bottom: 40px; line-height: 1.6; z-index: 10;">
             The biggest workspace community for academic projects. Find topics, draft papers, and collaborate over living documents in real-time.
          </p>

          <div class="gsap-hero-tags" style="display: flex; gap: 12px; align-items: center; margin-bottom: 60px; z-index: 10; color: #666; font-size: 0.9rem;">
             <span>Trending:</span>
             <span style="background: #161616; padding: 8px 16px; border-radius: 20px; color: #ccc;">Biology</span>
             <span style="background: #161616; padding: 8px 16px; border-radius: 20px; color: #ccc;">Quantum</span>
             <span style="background: #161616; padding: 8px 16px; border-radius: 20px; color: #ccc;">Deep Learning</span>
             <span style="background: #161616; padding: 8px 16px; border-radius: 20px; color: #ccc;">Sociology</span>
          </div>

          <div class="gsap-hero-btns" style="display: flex; gap: 20px; z-index: 10; align-items: center; justify-content: center;">
             <div onclick="window.location.hash='#/register'" style="box-sizing: border-box; background: #fff; color: #000; height: 56px; font-size: 1.05rem; font-weight: 700; padding: 0 40px; border-radius: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">Create Hub</div>
             <div onclick="window.location.hash='#/login'" style="box-sizing: border-box; background: #161616; color: #fff; border: 1px solid rgba(255,255,255,0.1); height: 56px; font-size: 1.05rem; font-weight: 600; padding: 0 40px; border-radius: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: background 0.2s;">
                <i class="fa-solid fa-play"></i> Watch Demo
             </div>
          </div>
      </section>

      <!-- Scrolling Marquee separator -->
      <div style="width: 100%; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 25px 0; background: #0c0c0c; overflow: hidden; white-space: nowrap;">
         <div class="hero-marquee-track" style="display: inline-flex; gap: 60px;">
            ${Array(8).fill(`
            <div style="font-size: 1.4rem; font-weight: 800; color: #fff; display: flex; gap: 60px; letter-spacing: -1px; align-items: center;">
               <span>COLLABORATE NOW <span style="display:inline-block; margin-left:14px; width:30px; height:30px; background:#ff4e00; border-radius:50%; text-align:center; line-height:30px; font-size:0.8rem; color:#fff;"><i class="fa-solid fa-arrow-right"></i></span></span>
               <span>DRAFT PAPERS <span style="display:inline-block; margin-left:14px; width:30px; height:30px; background:#ff4e00; border-radius:50%; text-align:center; line-height:30px; font-size:0.8rem; color:#fff;"><i class="fa-solid fa-arrow-right"></i></span></span>
               <span>PUBLISH TOPICS <span style="display:inline-block; margin-left:14px; width:30px; height:30px; background:#ff4e00; border-radius:50%; text-align:center; line-height:30px; font-size:0.8rem; color:#fff;"><i class="fa-solid fa-arrow-right"></i></span></span>
               <span>SHARE KNOWLEDGE <span style="display:inline-block; margin-left:14px; width:30px; height:30px; background:#ff4e00; border-radius:50%; text-align:center; line-height:30px; font-size:0.8rem; color:#fff;"><i class="fa-solid fa-arrow-right"></i></span></span>
            </div>
            `).join('')}
         </div>
      </div>

      <!-- Features Series -->
      <section id="features" style="padding: 120px 20px; text-align: center;">
          <h2 class="gsap-section-title" style="font-size: 3.5rem; font-weight: 800; margin-bottom: 16px; letter-spacing: -1px;">From Discovery to <span style="color:${accent};">Done</span></h2>
          <p style="color: #666; font-size: 1.1rem; margin-bottom: 60px;">Four simple steps to your next breakthrough.</p>
          
          <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px;">
             <!-- Feature Card 1 -->
             <div class="gsap-feature-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 50px 30px; border-radius: 20px; transition: transform 0.3s; text-align: center;">
                 <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,78,0,0.1); color: ${accent}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                 </div>
                 <h3 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 12px;">Discover</h3>
                 <p style="color: #888; font-size: 1rem; line-height: 1.5;">Find specific topics nested seamlessly.</p>
             </div>
             <!-- Feature Card 2 -->
             <div class="gsap-feature-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 50px 30px; border-radius: 20px; transition: transform 0.3s; text-align: center;">
                 <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,78,0,0.1); color: ${accent}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i class="fa-solid fa-pen-nib"></i>
                 </div>
                 <h3 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 12px;">Draft</h3>
                 <p style="color: #888; font-size: 1rem; line-height: 1.5;">Write highly detailed rich-text notes.</p>
             </div>
             <!-- Feature Card 3 -->
             <div class="gsap-feature-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 50px 30px; border-radius: 20px; transition: transform 0.3s; text-align: center;">
                 <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,78,0,0.1); color: ${accent}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i class="fa-solid fa-code-merge"></i>
                 </div>
                 <h3 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 12px;">Link</h3>
                 <p style="color: #888; font-size: 1rem; line-height: 1.5;">Interlock notes to global topics.</p>
             </div>
             <!-- Feature Card 4 -->
             <div class="gsap-feature-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 50px 30px; border-radius: 20px; transition: transform 0.3s; text-align: center;">
                 <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,78,0,0.1); color: ${accent}; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i class="fa-solid fa-users"></i>
                 </div>
                 <h3 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 12px;">Collaborate</h3>
                 <p style="color: #888; font-size: 1rem; line-height: 1.5;">Invite peers deeply into the process.</p>
             </div>
          </div>
      </section>

      <!-- Typography Section -->
      <section class="gsap-massive-text" style="padding: 100px 20px; max-width: 1000px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: clamp(1.8rem, 4vw, 3.2rem); font-weight: 800; line-height: 1.4; color: #fff; text-transform: uppercase;">
             JOIN TOP <span style="color:${accent};">RESEARCHERS</span>, SCIENTISTS, AND STUDENT LEADERS—THEY USE HUBS THAT TEACH YOU HOW TO PUBLISH <span style="color:${accent};">PAPERS</span>, GROW <span style="color:${accent};">COMMUNITIES</span>, AND GO VIRAL—ONLY ON <span style="color:${accent};">NEXUS</span>.
          </h2>
      </section>

      <!-- Testimonials -->
      <section id="testimonials" style="padding: 120px 0; background: rgba(255,255,255,0.01); overflow: hidden;">
          <div style="text-align: center; margin-bottom: 60px; padding: 0 20px;">
             <div style="display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,78,0,0.3); padding: 8px 16px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; color: ${accent}; margin-bottom: 24px;">
                <i class="fa-solid fa-comment"></i> TRUSTED BY STUDENTS
             </div>
             <h2 class="gsap-testm-title" style="font-size: 3.5rem; font-weight: 800; letter-spacing: -1px;">What Students <span style="color:${accent};">Say</span></h2>
          </div>

          <div class="reviews-slider" style="width: 100%; white-space: nowrap; overflow: hidden; padding: 20px 0;">
             <div class="reviews-track" style="display: inline-flex; gap: 24px;">
                <!-- Review Card Array (7 items duplicated for infinite scroll) -->
                ${Array(2).fill(`
                <!-- Rev 1 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "Nexus made organizing our massive research dataset so much easier! The tagging system is seamless and saved us hours of manual work."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #FF0076, #590FB7); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Priya Sharma</h4>
                       <p style="font-size: 0.85rem; color: #666;">IIT Delhi, CSE</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 2 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "As a lab coordinator, I needed a reliable platform. Nexus registration management secured our confidential notes effortlessly."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #00C9FF, #92FE9D); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Arjun Patel</h4>
                       <p style="font-size: 0.85rem; color: #666;">NIT Trichy, Mechanical</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 3 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star-half-stroke"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "Writing dissertations alongside 4 other PhD students used to be chaos. Now we just map it into Nexus perfectly."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #F9D423, #FF4E50); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">David Chen</h4>
                       <p style="font-size: 0.85rem; color: #666;">Stanford, Physics</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 4 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "Our robotics group handles thousands of logs. Nexus search indexing finds exactly what we need in milliseconds."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #12c2e9, #c471ed, #f64f59); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Sarah Jenkins</h4>
                       <p style="font-size: 0.85rem; color: #666;">MIT, Robotics</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 5 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "The granular permissions finally allow us to bring undergraduates into the workspace without risking sensitive data."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #fbc2eb, #a6c1ee); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Dr. Alan Wright</h4>
                       <p style="font-size: 0.85rem; color: #666;">Oxford, Biology</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 6 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star-half-stroke"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "Nexus replaced 3 different tools we were using for documentation. Centralizing everything improved velocity significantly."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #a8ff78, #78ffd6); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Ethan Cole</h4>
                       <p style="font-size: 0.85rem; color: #666;">UCL, Data Science</p>
                     </div>
                   </div>
                </div>
                <!-- Rev 7 -->
                <div class="gsap-review-card" style="background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; position: relative; width: 400px; white-space: normal; text-align: left; display: inline-block;">
                   <div style="color: ${accent}; margin-bottom: 20px; font-size: 1.1rem;">
                     <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                   </div>
                   <i class="fa-solid fa-quote-right" style="position: absolute; top: 40px; right: 40px; font-size: 3rem; color: rgba(255,255,255,0.03);"></i>
                   <p style="color: #bbb; line-height: 1.6; font-size: 1.05rem; margin-bottom: 30px; font-family: sans-serif; height: 100px;">
                      "Best platform for peer review cycles. We can highlight text, write comments, and resolve them instantly in real time."
                   </p>
                   <div style="display: flex; align-items: center; gap: 16px;">
                     <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #ff9a9e, #fecfef); flex-shrink: 0;"></div>
                     <div>
                       <h4 style="font-weight: 700; font-size: 1rem; color: #fff;">Maria Gonzalez</h4>
                       <p style="font-size: 0.85rem; color: #666;">Berkeley, Chemistry</p>
                     </div>
                   </div>
                </div>
                `).join('')}
             </div>
          </div>
      </section>

      <!-- FAQs Section -->
      <section id="faqs" style="padding: 120px 20px; background: #0a0a0a; text-align: center;">
          <h2 class="gsap-faq-title" style="font-size: 3.5rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 24px;">Frequently Asked <span style="color:${accent};">Questions</span></h2>
          <p style="color: #888; font-size: 1.1rem; margin-bottom: 40px;">Find quick answers about Nexus's features, security, organization, and datasets.</p>
          
          <div style="display: flex; justify-content: center; margin-bottom: 60px;">
              <div style="background: #161616; border: 1px solid rgba(255,255,255,0.05); border-radius: 40px; display: inline-flex; overflow: hidden; padding: 4px;">
                  <div id="faq-btn-researchers" style="background: ${accent}; padding: 12px 30px; border-radius: 30px; font-weight: 700; cursor: pointer; color:#fff; transition: all 0.3s;">Researchers</div>
                  <div id="faq-btn-reviewers" style="background: transparent; padding: 12px 30px; border-radius: 30px; font-weight: 600; color: #a0a0a0; cursor: pointer; transition: all 0.3s;">Reviewers</div>
              </div>
          </div>

          <div style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;">
              <!-- FAQ Item 1 -->
              <div class="faq-item" style="background: #111; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: left; overflow: hidden;">
                 <div class="faq-header" style="padding: 24px; font-weight: 600; font-size: 1.1rem; color: #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    How can I create a shared workspace in Nexus?
                    <i class="fa-solid fa-chevron-down faq-icon" style="color: #666; transition: transform 0.3s; font-size: 0.9rem;"></i>
                 </div>
                 <div class="faq-content" style="max-height: 0; padding: 0 24px; color: #888; line-height: 1.6; transition: max-height 0.4s ease-out, padding 0.4s ease-out;">
                    <div style="padding-bottom: 24px;">
                       You can create an isolated workspace easily by signing up and using the centralized dashboard. Each topic allows multi-tenant collaboration so that peer reviewers can only see what they are assigned to.
                    </div>
                 </div>
              </div>

              <!-- FAQ Item 2 -->
              <div class="faq-item" style="background: #111; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: left; overflow: hidden;">
                 <div class="faq-header" style="padding: 24px; font-weight: 600; font-size: 1.1rem; color: #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    What data can I access about my topics?
                    <i class="fa-solid fa-chevron-down faq-icon" style="color: #666; transition: transform 0.3s; font-size: 0.9rem;"></i>
                 </div>
                 <div class="faq-content" style="max-height: 0; padding: 0 24px; color: #888; line-height: 1.6; transition: max-height 0.4s ease-out, padding 0.4s ease-out;">
                    <div style="padding-bottom: 24px;">
                       You completely own your datasets. Our powerful rich-text backend maintains version-agnostic drafts and organizes full-text query search indexing automatically.
                    </div>
                 </div>
              </div>

              <!-- FAQ Item 3 -->
              <div class="faq-item" style="background: #111; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: left; overflow: hidden;">
                 <div class="faq-header" style="padding: 24px; font-weight: 600; font-size: 1.1rem; color: #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    How does the global permission system work?
                    <i class="fa-solid fa-chevron-down faq-icon" style="color: #666; transition: transform 0.3s; font-size: 0.9rem;"></i>
                 </div>
                 <div class="faq-content" style="max-height: 0; padding: 0 24px; color: #888; line-height: 1.6; transition: max-height 0.4s ease-out, padding 0.4s ease-out;">
                    <div style="padding-bottom: 24px;">
                       Nexus operates on an advanced multi-tenant isolation principle. Every user document and topic entity mapped securely to an authenticated JWT payload ensuring zero cross-leakage.
                    </div>
                 </div>
              </div>

              <!-- FAQ Item 4 -->
              <div class="faq-item" style="background: #111; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: left; overflow: hidden;">
                 <div class="faq-header" style="padding: 24px; font-weight: 600; font-size: 1.1rem; color: #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    Can I send instant updates to other researchers?
                    <i class="fa-solid fa-chevron-down faq-icon" style="color: #666; transition: transform 0.3s; font-size: 0.9rem;"></i>
                 </div>
                 <div class="faq-content" style="max-height: 0; padding: 0 24px; color: #888; line-height: 1.6; transition: max-height 0.4s ease-out, padding 0.4s ease-out;">
                    <div style="padding-bottom: 24px;">
                       Yes! Nexus is building live-socket push mechanics to guarantee your research updates distribute reliably to assigned participants instantly.
                    </div>
                 </div>
              </div>
          </div>
      </section>

      <!-- Footer -->
      <footer style="padding: 80px 60px 40px; background: #0c0c0c; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 20px solid transparent;">
          <div style="max-width: 1300px; margin: 0 auto; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 40px; margin-bottom: 80px;">
              
              <!-- Brand Column -->
              <div style="flex: 2; min-width: 300px;">
                  <div style="font-size: 2rem; font-weight: 800; color: #fff; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
                     <div style="border: 3px solid #fff; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-flask" style="color: #fff; font-size: 1.2rem;"></i>
                     </div>
                  </div>
                  <p style="color: #888; font-size: 1.05rem; line-height: 1.6; max-width: 350px; margin-bottom: 30px;">
                     The complete research operating system for campuses. Discover, Organize, and Draft papers efficiently.
                  </p>
                  <div style="display: flex; gap: 16px;">
                     <div style="width: 40px; height: 40px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.3s;">
                        <i class="fa-brands fa-instagram" style="color:#ccc;"></i>
                     </div>
                     <div style="width: 40px; height: 40px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.3s;">
                        <i class="fa-brands fa-linkedin" style="color:#ccc;"></i>
                     </div>
                  </div>
              </div>

              <!-- Links -->
              <div style="flex: 1; min-width: 150px;">
                 <h4 style="color: #fff; font-weight: 700; margin-bottom: 30px; font-size: 1.1rem;">Platform</h4>
                 <div style="display: flex; flex-direction: column; gap: 16px; color: #888; font-size: 0.95rem;">
                    <span style="cursor: pointer; transition: color 0.3s;">Explore Topics</span>
                    <span style="cursor: pointer; transition: color 0.3s;">For Researchers</span>
                 </div>
              </div>

              <div style="flex: 1; min-width: 150px;">
                 <h4 style="color: #fff; font-weight: 700; margin-bottom: 30px; font-size: 1.1rem;">Company</h4>
                 <div style="display: flex; flex-direction: column; gap: 16px; color: #888; font-size: 0.95rem;">
                    <span style="cursor: pointer; transition: color 0.3s;">About Us</span>
                    <span style="cursor: pointer; transition: color 0.3s;">Careers</span>
                    <span style="cursor: pointer; transition: color 0.3s; color:#fff;">Contact</span>
                 </div>
              </div>

              <!-- Newsletter -->
              <div style="flex: 1.5; min-width: 250px;">
                 <h4 style="color: #fff; font-weight: 700; margin-bottom: 30px; font-size: 1.1rem;">Stay in the loop</h4>
                 <p style="color: #888; font-size: 0.95rem; line-height: 1.5; margin-bottom: 20px;">
                    Get the latest papers and updates delivered straight to your inbox.
                 </p>
                 <div style="display: flex; background: #161616; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 6px; align-items: center;">
                    <input type="email" placeholder="Enter your email" style="background: transparent; border: none; outline: none; padding: 12px 16px; color: #fff; width: 100%; font-family: 'Inter', sans-serif;">
                    <button style="background: ${accent}; border: none; width: 44px; height: 44px; border-radius: 8px; color: #fff; cursor: pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.2s;"><i class="fa-solid fa-arrow-right"></i></button>
                 </div>
              </div>
          </div>

          <!-- Bottom Footer -->
          <div style="max-width: 1300px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 30px; color: #666; font-size: 0.85rem;">
             <div>&copy; 2026 Nexus Hub Inc. All rights reserved.</div>
             <div style="display: flex; gap: 24px;">
                <span style="cursor:pointer; transition: color 0.3s;">Privacy</span>
                <span style="cursor:pointer; transition: color 0.3s;">Terms</span>
                <span style="cursor:pointer; transition: color 0.3s;">Cookies</span>
             </div>
          </div>
      </footer>
    </div>
  `;

  // FAQ Accordion Logic
  setTimeout(() => {
     // Theme Toggle
     const themeBtn = document.getElementById('btn-theme-toggle');
     const landing = document.querySelector('.ns-landing');
     if(themeBtn && landing) {
         themeBtn.addEventListener('click', () => {
             landing.classList.toggle('light-theme');
             if(landing.classList.contains('light-theme')) {
                 themeBtn.classList.replace('fa-moon', 'fa-sun');
             } else {
                 themeBtn.classList.replace('fa-sun', 'fa-moon');
             }
         });
     }

     // Section Tabs logic
     const btnRes = document.getElementById('faq-btn-researchers');
     const btnRev = document.getElementById('faq-btn-reviewers');
     if(btnRes && btnRev) {
         btnRes.addEventListener('click', () => {
             btnRes.style.background = '#ff4e00'; btnRes.style.color = '#fff'; btnRes.style.fontWeight = '700';
             btnRev.style.background = 'transparent'; btnRev.style.color = '#a0a0a0'; btnRev.style.fontWeight = '600';
         });
         btnRev.addEventListener('click', () => {
             btnRev.style.background = '#ff4e00'; btnRev.style.color = '#fff'; btnRev.style.fontWeight = '700';
             btnRes.style.background = 'transparent'; btnRes.style.color = '#a0a0a0'; btnRes.style.fontWeight = '600';
         });
     }

     const faqHeaders = document.querySelectorAll('.faq-header');
     faqHeaders.forEach(header => {
         header.addEventListener('click', () => {
             const content = header.nextElementSibling;
             const icon = header.querySelector('.faq-icon');
             
             // Close all others
             document.querySelectorAll('.faq-content').forEach(c => {
                 if (c !== content) {
                     c.style.maxHeight = '0px';
                     c.style.padding = '0 24px';
                     c.previousElementSibling.querySelector('.faq-icon').style.transform = 'rotate(0deg)';
                 }
             });

             // Toggle current
             if (content.style.maxHeight === '0px' || !content.style.maxHeight) {
                 content.style.maxHeight = content.scrollHeight + 'px';
                 icon.style.transform = 'rotate(180deg)';
             } else {
                 content.style.maxHeight = '0px';
                 icon.style.transform = 'rotate(0deg)';
             }
         });
     });
  }, 100);

  // Inject Custom Styles
  if(!document.getElementById('ns-landing-styles')) {
     const style = document.createElement('style');
     style.id = 'ns-landing-styles';
     style.innerHTML = `
       .gsap-feature-card:hover { transform: translateY(-10px); border-color: rgba(255,78,0,0.3) !important; background: #151515 !important; }
       .gsap-review-card:hover { border-color: rgba(255,255,255,0.15) !important; }
       .ns-landing.light-theme { filter: invert(1) hue-rotate(180deg); transition: filter 0.4s; }
       .ns-landing.light-theme img, .ns-landing.light-theme .avatar { filter: invert(1) hue-rotate(180deg); }
       
       .reviews-track {
           animation: slideMarquee 35s linear infinite;
       }
       .reviews-track:hover {
           animation-play-state: paused;
       }
       .hero-marquee-track {
           animation: heroMarquee 25s linear infinite;
       }
       @keyframes heroMarquee {
           0% { transform: translateX(0); }
           100% { transform: translateX(calc(-50% - 30px)); }
       }
       @keyframes slideMarquee {
           0% { transform: translateX(0); }
           100% { transform: translateX(calc(-50% - 12px)); }
       }
     `;
     document.head.appendChild(style);
  }

  // GSAP Animations
  if(window.gsap) {
    const tl = gsap.timeline();
    
    // Hero Animations
    tl.from(".gsap-hero-badge", { y: -20, opacity: 0, duration: 0.6, ease: "back.out(2)" })
      .from(".gsap-hero-title", { y: 40, opacity: 0, duration: 0.8, ease: "power4.out" }, "-=0.3")
      .from(".gsap-hero-sub", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.5")
      .from(".gsap-hero-tags span", { scale: 0.8, opacity: 0, duration: 0.5, stagger: 0.1, ease: "back.out(1.5)" }, "-=0.4")
      .from(".gsap-hero-btns button", { y: 20, opacity: 0, duration: 0.6, stagger: 0.15, ease: "power3.out" }, "-=0.2");

    // ScrollTrigger Animations
    if(window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);

      // Features section
      gsap.from(".gsap-section-title", {
         scrollTrigger: { trigger: ".gsap-section-title", start: "top 80%" },
         y: 50, opacity: 0, duration: 0.8, ease: "power3.out"
      });
      gsap.from(".gsap-feature-card", {
         scrollTrigger: { trigger: ".gsap-feature-card", start: "top 85%" },
         y: 50, opacity: 0, duration: 0.8, stagger: 0.2, ease: "back.out(1.2)"
      });

      // Massive Typography
      gsap.from(".gsap-massive-text h2", {
         scrollTrigger: { trigger: ".gsap-massive-text", start: "top 75%" },
         y: 100, opacity: 0, duration: 1.5, ease: "power4.out"
      });

      // Testimonials
      gsap.from(".gsap-testm-title", {
         scrollTrigger: { trigger: ".gsap-testm-title", start: "top 80%" },
         y: 40, opacity: 0, duration: 0.8, ease: "power3.out"
      });
      gsap.from(".gsap-review-card", {
         scrollTrigger: { trigger: ".gsap-testm-title", start: "top 70%" },
         y: 40, opacity: 0, duration: 0.8, stagger: 0.2, ease: "power3.out"
      });
    }
  }
}

navigate();



async function fetchMe() {
   try {
     const data = await apiCall('/auth/me');
     if (!data) throw new Error('User not found in DB');
     state.user = data;
     localStorage.setItem('user', JSON.stringify(data));
   } catch (e) {
     console.error(e);
     if (e.message === 'User not found in DB' || e.message === 'Token is not valid') {
         if (typeof logout === 'function') logout();
     }
   }
}

function handleSearchNotes(e) {
  e.preventDefault();
  const q = document.getElementById('search-notes-input').value.toLowerCase();
  const filtered = state.notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  const container = document.getElementById('notes-container');
  container.innerHTML = filtered.map(note => `
    <div class="glass-panel note-card" onclick="window.location.hash='#/note/${note._id}'">
      <h3>${note.title}</h3>
      <p>${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>
      <div class="note-meta">
        <span>${new Date(note.updatedAt).toLocaleDateString()}</span>
        <span>${note.topic ? note.topic.name : 'Uncategorized'}</span>
      </div>
    </div>
  `).join('');
}

function renderSettings(app) {
  app.innerHTML = getLayout(`
    <div class="header"><h2>Settings</h2></div>
    <div style="display:flex; gap: 40px; flex-wrap: wrap;">
       <div class="glass-panel" style="padding: 30px; flex: 1; min-width: 300px;">
          <h3 style="margin-bottom: 20px; color: var(--primary);">Profile Settings</h3>
          <form id="profile-form" style="display:flex; flex-direction:column; gap:15px;">
             <input type="text" id="set-name" class="input-field" placeholder="Full Name" value="${state.user.name || ''}" required>
             <textarea id="set-bio" class="input-field" placeholder="Bio" style="min-height: 80px;">${state.user.bio || ''}</textarea>
             <input type="text" id="set-pic" class="input-field" placeholder="Profile Picture URL" value="${state.user.profilePic || ''}">
             <button type="submit" class="btn btn-primary">Update Profile</button>
          </form>
       </div>
       <div class="glass-panel" style="padding: 30px; flex: 1; min-width: 300px;">
          <h3 style="margin-bottom: 20px; color: var(--primary);">Security</h3>
          <form id="password-form" style="display:flex; flex-direction:column; gap:15px;">
             <input type="password" id="old-pass" class="input-field" placeholder="Current Password" required>
             <input type="password" id="new-pass" class="input-field" placeholder="New Password" required>
             <button type="submit" class="btn btn-primary">Change Password</button>
          </form>
          
          <div style="margin-top: 40px; border-top: 1px solid rgba(255,0,0,0.3); padding-top:20px;">
             <h3 style="color: #ff3333; margin-bottom: 10px;">Danger Zone</h3>
             <button onclick="deleteAccount()" class="btn" style="background:#ff3333; color:#fff;">Delete Account</button>
          </div>
       </div>
    </div>
  `);

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiCall('/auth/profile', 'PUT', {
        name: document.getElementById('set-name').value,
        bio: document.getElementById('set-bio').value,
        profilePic: document.getElementById('set-pic').value
      });
      state.user = data; localStorage.setItem('user', JSON.stringify(data));
      showToast('Profile updated');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiCall('/auth/password', 'PUT', {
        oldPassword: document.getElementById('old-pass').value,
        newPassword: document.getElementById('new-pass').value
      });
      showToast('Password updated');
      e.target.reset();
    } catch (err) { showToast(err.message, true); }
  });
}

async function deleteAccount() {
  if(!confirm('Are you sure you want to completely delete your account? This cannot be undone.')) return;
  try {
    await apiCall('/auth/account', 'DELETE');
    logout();
  } catch(e) { showToast(e.message, true); }
}

async function renderProfile(app, userId) {
  app.innerHTML = getLayout(`<div style="display:flex; justify-content:center; align-items:center; height:60vh;">Loading...</div>`);
  try {
    const isMe = userId === state.user.id || userId === state.user._id;
    let userProfile, userNotes;
    
    if (isMe) {
        await fetchMe();
        userProfile = state.user;
        const resNotes = await apiCall('/notes');
        userNotes = resNotes; // Only public notes are usually shown, but since it's me we can show all or just public. Let's show public + private for me.
    } else {
        const resData = await apiCall(`/auth/users/${userId}`);
        userProfile = resData.user;
        userNotes = resData.notes;
    }

    app.innerHTML = getLayout(`
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
         <div style="display:flex; gap: 24px; align-items: center; margin-bottom: 40px;">
           <img src="${userProfile.profilePic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border: 2px solid var(--primary);">
           <div>
             <h1 style="font-size: 2.5rem; margin-bottom: 8px;">${userProfile.name}</h1>
             <p style="color:var(--text-main); font-size:1.1rem; max-width: 500px;">${userProfile.bio || 'Researcher at Nexus'}</p>
             <button onclick="navigator.clipboard.writeText(window.location.href); showToast('Link copied!');" class="btn btn-secondary" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 12px;"><i class="fa-solid fa-link"></i> Share Profile</button>
           </div>
         </div>
      </div>
      
      <h3 style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 24px;">${isMe ? 'My Notes' : 'Public Notes'}</h3>
      <div class="dashboard-grid">
         ${userNotes.length === 0 ? '<p>No notes found.</p>' : userNotes.map(n => `
           <div class="glass-panel note-card" onclick="window.location.hash='#/note/${n._id}'">
             <div style="display:flex; justify-content:space-between;">
               <h3>${n.title}</h3>
               ${n.isPublic ? '<i class="fa-solid fa-globe" style="color:var(--primary)" title="Public"></i>' : '<i class="fa-solid fa-lock" style="color:#666" title="Private"></i>'}
             </div>
             <p>${n.content.substring(0, 100)}${n.content.length > 100 ? '...' : ''}</p>
             <div class="note-meta" style="display:flex; justify-content:space-between; align-items: center; margin-top: 20px;">
               <span>${n.topic ? n.topic.name : 'Uncategorized'}</span>
               <div style="display:flex; gap:16px; font-size:1.1rem;">
                 <span title="Likes"><i class="fa-solid fa-heart" onclick="event.stopPropagation(); toggleLike('${n._id}')" style="cursor:pointer; color:${n.likes && n.likes.includes(state.user.id || state.user._id)?'var(--accent)':'#666'}; transition: color 0.3s;"></i> <span style="font-size:0.8rem; color:#aaa;">${n.likes ? n.likes.length : 0}</span></span>
                 <span title="Save Note"><i class="fa-solid fa-bookmark" onclick="event.stopPropagation(); toggleSave('${n._id}')" style="cursor:pointer; color:${state.user.savedNotes && state.user.savedNotes.some(s => s === n._id || s._id === n._id)?'var(--primary)':'#666'}; transition: color 0.3s;"></i></span>
               </div>
             </div>
           </div>
         `).join('')}
      </div>

      ${isMe ? `
      <h3 style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-top: 60px; margin-bottom: 24px;">Saved / Wishlist Notes</h3>
      <div class="dashboard-grid">
         ${(state.user.savedNotes && state.user.savedNotes.length > 0) ? state.user.savedNotes.map(n => `
           <div class="glass-panel note-card" onclick="window.location.hash='#/note/${n._id || n}'">
             <h3>${n.title || 'Saved Note'}</h3>
             <p>${n.content ? n.content.substring(0,100) : ''}</p>
           </div>
         `).join('') : '<p>No saved notes.</p>'}
      </div>
      ` : ''}
    `);
  } catch(e) {
    app.innerHTML = getLayout(`<h2>User not found</h2>`);
    console.error(e);
  }
}

async function renderSearch(app) {
  app.innerHTML = getLayout(`
    <div class="header" style="justify-content:flex-start;">
       <div class="search-bar" style="width: 100%; max-width: 600px;">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="user-search-input" placeholder="Search researchers by name..." autofocus>
       </div>
    </div>
    <div id="users-search-results" style="display:flex; flex-direction:column; gap:16px;">
        <div style="color:#888;">Type a name to search...</div>
    </div>
  `);

  document.getElementById('user-search-input').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    if(q.length < 2) return;
    try {
      const users = await apiCall(`/auth/users/search?q=${q}`);
      const container = document.getElementById('users-search-results');
      if(users.length === 0) container.innerHTML = '<p>No users found.</p>';
      else {
         container.innerHTML = users.map(u => `
           <div class="glass-panel" style="padding: 24px; display:flex; align-items:center; gap: 20px; cursor:pointer;" onclick="window.location.hash='#/profile/${u._id}'">
             <img src="${u.profilePic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u._id}" style="width:60px; height:60px; border-radius:50%;">
             <div>
                <h3 style="margin-bottom:4px; color:var(--text-light);">${u.name}</h3>
                <p style="font-size: 0.9rem; color: var(--text-main);">${u.bio || 'Researcher at Nexus'}</p>
             </div>
           </div>
         `).join('');
      }
    } catch(err) { console.error(err); }
  });
}

// Add like/save functions globally
window.toggleLike = async function(id) {
   try {
     const likes = await apiCall(`/notes/${id}/like`, 'POST');
     // Re-render
     navigate();
   } catch(e) { showToast(e.message, true); }
}

window.toggleSave = async function(id) {
   try {
     const saved = await apiCall(`/notes/${id}/save`, 'POST');
     await fetchMe(); // update local state
     navigate();
     showToast('Saved notes updated!');
   } catch(e) { showToast(e.message, true); }
}

