import './index.css';

// Helper to handle potential null elements gracefully
function getElement<T extends HTMLElement | SVGElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function init() {
    const textarea = getElement<HTMLTextAreaElement>('ai-textarea');
    const submitBtn = getElement<HTMLButtonElement>('submit-btn');
    const modelSelectBtn = getElement<HTMLDivElement>('model-select-btn');
    const dropdown = getElement<HTMLDivElement>('model-dropdown');
    const chevron = getElement<SVGElement>('chevron-icon');
    const modelLabel = getElement<HTMLSpanElement>('current-model-label');
    const modelOptions = document.querySelectorAll('.model-option');
    const themeBtn = getElement<HTMLButtonElement>('theme-btn');
    const curtain = getElement<HTMLDivElement>('curtain');
    const rotatingWord = getElement<HTMLSpanElement>('rotating-word');
    const moonIcon = getElement<SVGElement>('moon-icon');
    const sunIcon = getElement<SVGElement>('sun-icon');

    // 0. Persistence & Initial Theme
    window.addEventListener('load', () => {
        if (curtain) curtain.classList.add('rising');
    });

    const savedTheme = localStorage.getItem('huggy-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (moonIcon && sunIcon) {
        if (savedTheme === 'dark') {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        } else {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        }
    }

    let curtainBusy = false;

    // 1. Auto-resize textarea
    textarea?.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        updateSubmit();
    });

    textarea?.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (submitBtn?.classList.contains('active')) {
                console.log('Form submitted:', textarea.value);
                // Reset for demo
                textarea.value = '';
                updateSubmit();
                textarea.style.height = 'auto';
            }
        }
    });

    // 2. Submit button state
    function updateSubmit() {
        if (!textarea || !submitBtn) return;
        const active = textarea.value.trim().length > 0;
        if (active) {
            submitBtn.classList.add('active');
        } else {
            submitBtn.classList.remove('active');
        }
    }

    submitBtn?.addEventListener('click', handleSubmit);

    // 3. Rotating words
    if (rotatingWord) {
        const words = ["SaaS", "app", "website", "dashboard", "platform", "tool", "portal", "system"];
        let idx = 0;
        setInterval(() => {
            rotatingWord.classList.add('exit');
            setTimeout(() => {
                idx = (idx + 1) % words.length;
                rotatingWord.textContent = words[idx];
                rotatingWord.classList.remove('exit');
                rotatingWord.classList.add('enter');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        rotatingWord.classList.remove('enter');
                    });
                });
            }, 260);
        }, 2200);
    }

    // 4. Model dropdown
    modelSelectBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!dropdown || !chevron) return;
        const isOpen = dropdown.classList.contains('open');
        if (isOpen) {
            dropdown.classList.remove('open');
            chevron.style.transform = 'rotate(0deg)';
        } else {
            dropdown.classList.add('open');
            chevron.style.transform = 'rotate(180deg)';
        }
    });

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (dropdown && !dropdown.contains(target) && !modelSelectBtn?.contains(target)) {
            dropdown.classList.remove('open');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    });

    // 5. Model selection
    modelOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            modelOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            if (modelLabel) modelLabel.textContent = (opt as HTMLElement).dataset.name || '';
            dropdown?.classList.remove('open');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        });
    });

    // 6. Theme toggle
    themeBtn?.addEventListener('click', () => {
        if (curtainBusy || !curtain) return;
        curtainBusy = true;
        
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('huggy-theme', newTheme);
        
        // Set curtain color to the NEW theme background
        curtain.style.background = newTheme === 'light' ? '#F8F5F0' : '#060606';
        curtain.style.transformOrigin = 'top';
        curtain.classList.add('falling');

        setTimeout(() => {
            document.documentElement.setAttribute('data-theme', newTheme);
            
            // Toggle icons
            if (moonIcon && sunIcon) {
                if (newTheme === 'dark') {
                    moonIcon.style.display = 'block';
                    sunIcon.style.display = 'none';
                } else {
                    moonIcon.style.display = 'none';
                    sunIcon.style.display = 'block';
                }
            }

            // Prepare for rising (wipe out from bottom)
            curtain.classList.remove('falling');
            
            // Small raf to ensure transition reset if needed
            requestAnimationFrame(() => {
                curtain.style.transformOrigin = 'bottom';
                curtain.classList.add('rising');

                setTimeout(() => {
                    curtain.classList.remove('rising');
                    curtainBusy = false;
                }, 620);
            });
        }, 600);
    });

    // 7. FAQ Toggle
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question?.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(i => i.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // 8. Keyboard shortcuts
    textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (textarea.value.trim().length > 0) {
                handleSubmit();
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            if (textarea.value.trim().length > 0) {
                handleSubmit();
            }
        }
    });

    function handleSubmit() {
        if (!textarea || !submitBtn) return;
        const val = textarea.value.trim();
        if (!val) return;

        // Save for builder synchronization
        sessionStorage.setItem('huggy-initial-prompt', val);

        submitBtn.disabled = true;
        submitBtn.querySelector('span')!.textContent = 'Designing...';
        textarea.disabled = true;
        textarea.style.opacity = '0.5';

        // Simulate a brief loading sequence before transition
        setTimeout(() => {
            submitBtn.querySelector('span')!.textContent = 'Redirecting...';
            
            // Sweep transition before redirect
            if (curtain) {
                curtain.style.transformOrigin = 'top';
                curtain.classList.add('falling');
                
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 600);
            } else {
                window.location.href = '/dashboard.html';
            }
        }, 1200);
    }

    // 9. Scroll Reveal
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });

    // 10. Modals & Interactivity
    const modalOverlay = getElement<HTMLDivElement>('modal-overlay');
    const modalClose = getElement<HTMLButtonElement>('modal-close');
    const modalBody = getElement<HTMLDivElement>('modal-body');

    function openModal(html: string) {
        if (!modalOverlay || !modalBody) return;
        modalBody.innerHTML = html;
        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modalOverlay?.classList.remove('open');
        document.body.style.overflow = '';
    }

    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Import buttons
    document.querySelectorAll('.import-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.querySelector('span')?.textContent;
            openModal(`
                <div style="text-align: center; padding: 20px 0;">
                    <div style="width: 60px; height: 60px; background: var(--accent-dim); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </div>
                    <h2 style="margin-bottom: 12px; font-weight: 700;">Import from ${platform}</h2>
                    <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 32px;">Connect your account to sync your ${platform} designs directly into your generation pipeline.</p>
                    <button class="sign-in-btn" style="width: 100%; justify-content: center; padding: 14px;">Connect Account</button>
                    <p style="font-size: 11px; color: var(--text-sub); margin-top: 16px;">Coming soon to Pro and Enterprise plans.</p>
                </div>
            `);
        });
    });

    // Sign in flow
    document.querySelectorAll('.sign-in-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openModal(`
                <div style="text-align: center;">
                    <h2 style="margin-bottom: 32px; font-weight: 700;">Welcome back</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <button class="import-btn" style="padding: 12px; justify-content: center;">Continue with Google</button>
                        <button class="import-btn" style="padding: 12px; justify-content: center;">Continue with GitHub</button>
                    </div>
                    <div style="margin: 24px 0; display: flex; align-items: center; gap: 12px;">
                        <div style="flex: 1; height: 1px; background: var(--border);"></div>
                        <span style="font-size: 11px; color: var(--text-sub);">OR</span>
                        <div style="flex: 1; height: 1px; background: var(--border);"></div>
                    </div>
                    <input type="email" placeholder="Email address" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--bg-input); border: 1px solid var(--border); margin-bottom: 12px; color: var(--text);">
                    <button class="sign-in-btn" style="width: 100%; justify-content: center; padding: 12px;">Send Magic Link</button>
                </div>
            `);
        });
    });

    // Toasts
    const toastContainer = getElement<HTMLDivElement>('toast-container');
    function showToast(message: string) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Sticky CTA Visibility
    const stickyCta = getElement<HTMLElement>('sticky-cta');
    window.addEventListener('scroll', () => {
        if (!stickyCta) return;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollHeight <= 0) return;
        const scrollPercentage = (window.scrollY / scrollHeight) * 100;
        
        if (scrollPercentage > 50) {
            stickyCta.classList.add('visible');
        } else {
            stickyCta.classList.remove('visible');
        }
    });
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

