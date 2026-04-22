const fs = require('fs');

let cssPath = './public/style.css';
let cssCode = fs.readFileSync(cssPath, 'utf8');

// Update CSS theme to dark orange
cssCode = cssCode.replace(/--primary: #7aa2f7;/g, '--primary: #ff4e00;');
cssCode = cssCode.replace(/--primary-hover: #8caaee;/g, '--primary-hover: #ff7333;');
cssCode = cssCode.replace(/--secondary: #bb9af7;/g, '--secondary: #ff8c00;');
cssCode = cssCode.replace(/--accent: #f7768e;/g, '--accent: #ff4e00;');
cssCode = cssCode.replace(/background: var\(--bg-panel\);/g, 'background: rgba(10,10,10,0.8);');
cssCode = cssCode.replace(/--bg-card: .*/g, '--bg-card: rgba(20,20,20,0.8);');
cssCode = cssCode.replace(/--bg-dark: #0f111a;/g, '--bg-dark: #050505;');

fs.writeFileSync(cssPath, cssCode);

let appPath = './public/app.js';
let appCode = fs.readFileSync(appPath, 'utf8');

if (!appCode.includes('renderSettings(app)')) {
  // Update navigate function
  appCode = appCode.replace(
    '  if (hash === \'#/\') renderDashboard(app);',
    `  if (hash === '#/') renderDashboard(app);
  else if (hash === '#/settings') renderSettings(app);
  else if (hash === '#/search') renderSearch(app);
  else if (hash.startsWith('#/profile/')) {
    const id = hash.split('/')[2];
    renderProfile(app, id);
  }`
  );

  // Update getLayout Function
  appCode = appCode.replace(
    '<li class="nav-item" onclick="toggleTopicModal()">',
    `<li class="nav-item \${window.location.hash.startsWith('#/profile') ? 'active' : ''}" onclick="window.location.hash='#/profile/\${state.user.id || state.user._id}'">
            <i class="fa-solid fa-user"></i> Profile
          </li>
          <li class="nav-item \${window.location.hash === '#/search' ? 'active' : ''}" onclick="window.location.hash='#/search'">
            <i class="fa-solid fa-users"></i> Search Users
          </li>
          <li class="nav-item \${window.location.hash === '#/settings' ? 'active' : ''}" onclick="window.location.hash='#/settings'">
            <i class="fa-solid fa-gear"></i> Settings
          </li>
          <li class="nav-item" onclick="toggleTopicModal()">`
  );

  // Refresh user id safely
  // appCode = appCode.replace(/state\\.user\\._id/g, 'state.user.id');

  // Fix search notes button top bar and add styles to form
  const rawFunctions = `
async function fetchMe() {
   try {
     const data = await apiCall('/auth/me');
     if (!data) throw new Error('User not found in DB');
     state.user = data;
     localStorage.setItem('user', JSON.stringify(data));
   } catch (e) {
     console.error(e);
     if (e.message === 'User not found in DB' || e.message === 'Token is not valid') {
         logout();
     }
   }
}

function handleSearchNotes(e) {
  e.preventDefault();
  const q = document.getElementById('search-notes-input').value.toLowerCase();
  const filtered = state.notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  const container = document.getElementById('notes-container');
  container.innerHTML = filtered.map(note => \`
    <div class="glass-panel note-card" onclick="window.location.hash='#/note/\${note._id}'">
      <h3>\${note.title}</h3>
      <p>\${note.content.substring(0, 100)}\${note.content.length > 100 ? '...' : ''}</p>
      <div class="note-meta">
        <span>\${new Date(note.updatedAt).toLocaleDateString()}</span>
        <span>\${note.topic ? note.topic.name : 'Uncategorized'}</span>
      </div>
    </div>
  \`).join('');
}

function renderSettings(app) {
  app.innerHTML = getLayout(\`
    <div class="header"><h2>Settings</h2></div>
    <div style="display:flex; gap: 40px; flex-wrap: wrap;">
       <div class="glass-panel" style="padding: 30px; flex: 1; min-width: 300px;">
          <h3 style="margin-bottom: 20px; color: var(--primary);">Profile Settings</h3>
          <form id="profile-form" style="display:flex; flex-direction:column; gap:15px;">
             <input type="text" id="set-name" class="input-field" placeholder="Full Name" value="\${state.user.name || ''}" required>
             <textarea id="set-bio" class="input-field" placeholder="Bio" style="min-height: 80px;">\${state.user.bio || ''}</textarea>
             <input type="text" id="set-pic" class="input-field" placeholder="Profile Picture URL" value="\${state.user.profilePic || ''}">
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
  \`);

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
  app.innerHTML = getLayout(\`<div style="display:flex; justify-content:center; align-items:center; height:60vh;">Loading...</div>\`);
  try {
    const isMe = userId === state.user.id || userId === state.user._id;
    let userProfile, userNotes;
    
    if (isMe) {
        await fetchMe();
        userProfile = state.user;
        const resNotes = await apiCall('/notes');
        userNotes = resNotes; // Only public notes are usually shown, but since it's me we can show all or just public. Let's show public + private for me.
    } else {
        const resData = await apiCall(\`/auth/users/\${userId}\`);
        userProfile = resData.user;
        userNotes = resData.notes;
    }

    app.innerHTML = getLayout(\`
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
         <div style="display:flex; gap: 24px; align-items: center; margin-bottom: 40px;">
           <img src="\${userProfile.profilePic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border: 2px solid var(--primary);">
           <div>
             <h1 style="font-size: 2.5rem; margin-bottom: 8px;">\${userProfile.name}</h1>
             <p style="color:var(--text-main); font-size:1.1rem; max-width: 500px;">\${userProfile.bio || 'Researcher at Nexus'}</p>
             <button onclick="navigator.clipboard.writeText(window.location.href); showToast('Link copied!');" class="btn btn-secondary" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 12px;"><i class="fa-solid fa-link"></i> Share Profile</button>
           </div>
         </div>
      </div>
      
      <h3 style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 24px;">\${isMe ? 'My Notes' : 'Public Notes'}</h3>
      <div class="dashboard-grid">
         \${userNotes.length === 0 ? '<p>No notes found.</p>' : userNotes.map(n => \`
           <div class="glass-panel note-card" onclick="window.location.hash='#/note/\${n._id}'">
             <div style="display:flex; justify-content:space-between;">
               <h3>\${n.title}</h3>
               \${n.isPublic ? '<i class="fa-solid fa-globe" style="color:var(--primary)" title="Public"></i>' : '<i class="fa-solid fa-lock" style="color:#666" title="Private"></i>'}
             </div>
             <p>\${n.content.substring(0, 100)}\${n.content.length > 100 ? '...' : ''}</p>
             <div class="note-meta" style="display:flex; justify-content:space-between; align-items: center; margin-top: 20px;">
               <span>\${n.topic ? n.topic.name : 'Uncategorized'}</span>
               <div style="display:flex; gap:16px; font-size:1.1rem;">
                 <span title="Likes"><i class="fa-solid fa-heart" onclick="event.stopPropagation(); toggleLike('\${n._id}')" style="cursor:pointer; color:\${n.likes && n.likes.includes(state.user.id || state.user._id)?'var(--accent)':'#666'}; transition: color 0.3s;"></i> <span style="font-size:0.8rem; color:#aaa;">\${n.likes ? n.likes.length : 0}</span></span>
                 <span title="Save Note"><i class="fa-solid fa-bookmark" onclick="event.stopPropagation(); toggleSave('\${n._id}')" style="cursor:pointer; color:\${state.user.savedNotes && state.user.savedNotes.some(s => s === n._id || s._id === n._id)?'var(--primary)':'#666'}; transition: color 0.3s;"></i></span>
               </div>
             </div>
           </div>
         \`).join('')}
      </div>

      \${isMe ? \`
      <h3 style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-top: 60px; margin-bottom: 24px;">Saved / Wishlist Notes</h3>
      <div class="dashboard-grid">
         \${(state.user.savedNotes && state.user.savedNotes.length > 0) ? state.user.savedNotes.map(n => \`
           <div class="glass-panel note-card" onclick="window.location.hash='#/note/\${n._id || n}'">
             <h3>\${n.title || 'Saved Note'}</h3>
             <p>\${n.content ? n.content.substring(0,100) : ''}</p>
           </div>
         \`).join('') : '<p>No saved notes.</p>'}
      </div>
      \` : ''}
    \`);
  } catch(e) {
    app.innerHTML = getLayout(\`<h2>User not found</h2>\`);
    console.error(e);
  }
}

async function renderSearch(app) {
  app.innerHTML = getLayout(\`
    <div class="header" style="justify-content:flex-start;">
       <div class="search-bar" style="width: 100%; max-width: 600px;">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="user-search-input" placeholder="Search researchers by name..." autofocus>
       </div>
    </div>
    <div id="users-search-results" style="display:flex; flex-direction:column; gap:16px;">
        <div style="color:#888;">Type a name to search...</div>
    </div>
  \`);

  document.getElementById('user-search-input').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    if(q.length < 2) return;
    try {
      const users = await apiCall(\`/auth/users/search?q=\${q}\`);
      const container = document.getElementById('users-search-results');
      if(users.length === 0) container.innerHTML = '<p>No users found.</p>';
      else {
         container.innerHTML = users.map(u => \`
           <div class="glass-panel" style="padding: 24px; display:flex; align-items:center; gap: 20px; cursor:pointer;" onclick="window.location.hash='#/profile/\${u._id}'">
             <img src="\${u.profilePic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u._id}" style="width:60px; height:60px; border-radius:50%;">
             <div>
                <h3 style="margin-bottom:4px; color:var(--text-light);">\${u.name}</h3>
                <p style="font-size: 0.9rem; color: var(--text-main);">\${u.bio || 'Researcher at Nexus'}</p>
             </div>
           </div>
         \`).join('');
      }
    } catch(err) { console.error(err); }
  });
}

// Add like/save functions globally
window.toggleLike = async function(id) {
   try {
     const likes = await apiCall(\`/notes/\${id}/like\`, 'POST');
     // Re-render
     navigate();
   } catch(e) { showToast(e.message, true); }
}

window.toggleSave = async function(id) {
   try {
     const saved = await apiCall(\`/notes/\${id}/save\`, 'POST');
     await fetchMe(); // update local state
     navigate();
     showToast('Saved notes updated!');
   } catch(e) { showToast(e.message, true); }
}

`;

  appCode = appCode + '\n' + rawFunctions;
  fs.writeFileSync(appPath, appCode);
}
console.log('Frontend base generated successfully!');
