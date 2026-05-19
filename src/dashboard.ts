import { supabase } from './supabase';

async function checkSession() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    window.location.href = '/auth.html';
    return;
  }

  // Populate user data on UI
  const email = user.email || '';
  const fullName = user.user_metadata?.full_name || email.split('@')[0] || 'User';
  const initials = fullName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Sidebar profile
  const profileAvatar = document.querySelector('.profile-avatar') as HTMLElement;
  const profileName = document.querySelector('.profile-name') as HTMLElement;
  const profileEmail = document.querySelector('.profile-email') as HTMLElement;

  if (profileAvatar) profileAvatar.textContent = initials;
  if (profileName) profileName.textContent = fullName;
  if (profileEmail) profileEmail.textContent = email;

  // Settings modal profile fields
  const settingsAvatar = document.querySelector('#tab-profil .avatar-large') as HTMLElement;
  const settingsName = document.querySelector('#tab-profil input[type="text"]') as HTMLInputElement;
  const settingsEmail = document.querySelector('#tab-profil input[type="email"]') as HTMLInputElement;

  if (settingsAvatar) settingsAvatar.textContent = initials;
  if (settingsName) settingsName.value = fullName;
  if (settingsEmail) settingsEmail.value = email;
}

// Log Out Handler
const btnLogout = document.getElementById('btn-logout');
btnLogout?.addEventListener('click', async (e) => {
  e.preventDefault();
  const { error } = await supabase.auth.signOut();
  window.location.href = '/auth.html';
});

// Run session check
checkSession();
