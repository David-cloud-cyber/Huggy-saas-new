// @ts-ignore
import './index.css';
import { normalizeAiChatInputs } from './ai-chat-input-normalizer';
import { initHuggyMotion } from './huggy-motion';
import { initProviderModelSelectors } from './model-selector-ui';
import { initPromptInputActions, storePendingPromptAttachments, type PendingPromptAttachment } from './prompt-input-actions';
import { startCreateProjectFlow } from './services/create-project-flow';
import { buildImportContext, type HuggyImportSource } from './services/import-intelligence';
import { installPublicPageEnhancements } from './public-page-enhancements';

// Helper to handle potential null elements gracefully
function getElement<T extends HTMLElement | SVGElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function init() {
    initHuggyMotion();
    normalizeAiChatInputs();

    const themeBtn = getElement<HTMLButtonElement>('theme-btn');
    const curtain = getElement<HTMLDivElement>('curtain');
    const rotatingWord = getElement<HTMLSpanElement>('rotating-word');
    const moonIcon = getElement<SVGElement>('moon-icon');
    const sunIcon = getElement<SVGElement>('sun-icon');

    // 0. Persistence & Initial Theme
    const liftCurtain = () => {
        if (curtain) curtain.classList.add('rising');
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        liftCurtain();
    } else {
        window.addEventListener('load', liftCurtain);
    }

    const savedTheme = localStorage.getItem('huggy-theme') || 'light';
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

    // Toasts (hoisted for use in wrappers)
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

    function installMarketingEnhancements() {
        const path = window.location.pathname;
        const isProductShell = /\/(builder|dashboard|auth)\.html$/.test(path);
        if (isProductShell) return;

        const navbar = document.querySelector('.navbar');
        const navbarLine = document.querySelector('.navbar-line');
        if (navbar) {
            const updateNavbarSurface = () => {
                const transparent = window.scrollY <= 10;
                navbar.classList.toggle('navbar-transparent-on-scroll', transparent);
                navbarLine?.classList.toggle('navbar-transparent-on-scroll', transparent);
            };
            updateNavbarSurface();
            window.addEventListener('scroll', updateNavbarSurface, { passive: true });
        }

        const pageContent = document.querySelector('.page-content');
        if (pageContent && !document.querySelector('.page-proof-grid')) {
            const title = document.querySelector('.page-hero h1')?.textContent?.trim() || 'Huggy';
            const proof = document.createElement('section');
            proof.className = 'page-proof-grid reveal';
            proof.innerHTML = `
                <article>
                    <span>01</span>
                    <h3>Clear next step</h3>
                    <p>${title} is designed to help visitors understand what Huggy does and where to go next without hunting through the page.</p>
                </article>
                <article>
                    <span>02</span>
                    <h3>Builder-first path</h3>
                    <p>Every public page now leads back to the same core action: describe an app, open the builder and keep momentum.</p>
                </article>
                <article>
                    <span>03</span>
                    <h3>Trust before action</h3>
                    <p>Visitors see the product promise, the workflow and the launch path before being asked to sign in or upgrade.</p>
                </article>
            `;
            pageContent.insertAdjacentElement('afterend', proof);
        }

        const footer = document.querySelector('.footer');
        const alreadyHasPrompt = document.querySelector('.marketing-prompt-section, .cta-prompt-section');
        if (footer && !alreadyHasPrompt) {
            const prompt = document.createElement('section');
            prompt.className = 'marketing-prompt-section reveal';
            prompt.innerHTML = `
                <div class="marketing-prompt-copy">
                    <span class="marketing-kicker">Start from a prompt</span>
                    <h2>Turn the next idea into a working app.</h2>
                    <p>Describe the product, workflow or landing page you want. Huggy will open a builder workspace and keep your draft moving from idea to preview.</p>
                </div>
                <div class="input-wrapper marketing-prompt-card">
                    <textarea rows="3" placeholder="Example: Build a client portal with login, projects, invoices and a clean dashboard."></textarea>
                    <div class="input-actions">
                        <div class="actions-left">
                            <button class="icon-btn" data-tooltip="Attach files" data-prompt-action="upload" aria-label="Attach files" type="button">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                            <button class="icon-btn" data-tooltip="Voice input" data-prompt-action="voice" aria-label="Voice input" type="button">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="actions-right">
                            <div class="prompt-mode" data-prompt-mode="auto">
                                <button class="prompt-mode-btn" type="button" aria-haspopup="menu" aria-expanded="false" title="Choose Auto, Build or Plan">
                                    <span class="prompt-mode-label">Auto</span>
                                    <span class="prompt-mode-chevron" aria-hidden="true">v</span>
                                </button>
                                <div class="prompt-mode-menu" role="menu">
                                    <button type="button" data-prompt-mode-option="auto" role="menuitem" class="active"><span>Auto</span><small>Let Huggy decide</small></button>
                                    <button type="button" data-prompt-mode-option="build" role="menuitem"><span>Build</span><small>Create or edit the app</small></button>
                                    <button type="button" data-prompt-mode-option="plan" role="menuitem"><span>Plan</span><small>Think first</small></button>
                                </div>
                            </div>
                            <button class="submit-btn" title="Open builder" type="button">
                                <span>Open builder</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="19" x2="12" y2="5"></line>
                                    <polyline points="5 12 12 5 19 12"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            footer.insertAdjacentElement('beforebegin', prompt);
        }
    }

    installMarketingEnhancements();
    installPublicPageEnhancements();
    initPromptInputActions({ persistForBuilder: true });
    normalizeAiChatInputs();

    type PublicAuthState = 'unknown' | 'signed-in' | 'signed-out';
    let publicAuthState: PublicAuthState = 'unknown';
    let publicAuthCheckPromise: Promise<PublicAuthState> | null = null;

    function setPublicAuthCtaState(state: PublicAuthState) {
        const signedIn = state === 'signed-in';
        document.querySelectorAll<HTMLElement>('.sign-in-btn').forEach(button => {
            button.textContent = signedIn ? 'Dashboard' : 'Sign In';
            button.dataset.authState = state;
            button.setAttribute('aria-label', signedIn ? 'Open your Huggy dashboard' : 'Sign in to Huggy');
            button.classList.toggle('is-authenticated', signedIn);
        });

        const stickyCta = document.getElementById('sticky-cta') as HTMLAnchorElement | null;
        if (stickyCta) {
            stickyCta.href = signedIn ? '/dashboard.html' : '/auth.html';
            const textNode = Array.from(stickyCta.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) textNode.textContent = signedIn ? 'Continue in Huggy ' : 'Build with Huggy ';
            stickyCta.setAttribute('aria-label', signedIn ? 'Continue in Huggy dashboard' : 'Build with Huggy');
        }
    }

    async function resolvePublicAuthState(force = false): Promise<PublicAuthState> {
        if (!force && publicAuthState !== 'unknown') return publicAuthState;
        if (!force && publicAuthCheckPromise) return publicAuthCheckPromise;

        publicAuthCheckPromise = (async () => {
            try {
                const { getVerifiedSession, supabase } = await import('./lib/supabase-browser');
                const verified = await getVerifiedSession({ allowRefresh: true });
                const nextState: PublicAuthState = verified?.user ? 'signed-in' : 'signed-out';
                publicAuthState = nextState;
                setPublicAuthCtaState(nextState);

                supabase.auth.onAuthStateChange((_event, session) => {
                    const state: PublicAuthState = session?.user ? 'signed-in' : 'signed-out';
                    publicAuthState = state;
                    setPublicAuthCtaState(state);
                });

                return nextState;
            } catch {
                publicAuthState = 'signed-out';
                setPublicAuthCtaState('signed-out');
                return 'signed-out';
            } finally {
                publicAuthCheckPromise = null;
            }
        })();

        return publicAuthCheckPromise;
    }

    function navigateWithCurtain(url: string) {
        if (curtain && !curtainBusy) {
            curtainBusy = true;
            curtain.style.transformOrigin = 'top';
            curtain.classList.add('falling');
            setTimeout(() => {
                window.location.href = url;
            }, 600);
        } else {
            window.location.href = url;
        }
    }

    void resolvePublicAuthState();

    // 1. Refactored Input Wrappers Logic (supports multiple instances)
    const wrappers = document.querySelectorAll('.input-wrapper');
    wrappers.forEach((wrapper) => {
        const textarea = wrapper.querySelector('textarea') as HTMLTextAreaElement | null;
        const submitBtn = wrapper.querySelector('.submit-btn') as HTMLButtonElement | null;
        const modelSelectBtn = wrapper.querySelector('.model-select') as HTMLDivElement | null;
        const dropdown = wrapper.querySelector('.dropdown') as HTMLDivElement | null;
        const chevron = wrapper.querySelector('#chevron-icon, svg.chevron, svg') as SVGElement | null; 
        const modelLabel = wrapper.querySelector('#current-model-label, .current-model-label, span:not(.model-label-prefix)') as HTMLSpanElement | null;
        const modelOptions = wrapper.querySelectorAll('.model-option');
        const promptModeRoot = wrapper.querySelector('.prompt-mode') as HTMLDivElement | null;
        const promptModeBtn = wrapper.querySelector('.prompt-mode-btn') as HTMLButtonElement | null;
        const promptModeLabel = wrapper.querySelector('.prompt-mode-label') as HTMLSpanElement | null;
        const promptModeOptions = wrapper.querySelectorAll('[data-prompt-mode-option]');
        type PromptMode = 'auto' | 'build' | 'plan';
        let selectedPromptMode: PromptMode = 'auto';
        
        const btnSearch = wrapper.querySelector('#btn-search, .btn-search, button[data-tooltip="Search snippets"]') as HTMLButtonElement | null;

        // Auto-resize textarea
        textarea?.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
            updateSubmit();
        });

        function updateSubmit() {
            if (!textarea || !submitBtn) return;
            const active = textarea.value.trim().length > 0;
            if (active) {
                submitBtn.classList.add('active');
            } else {
                submitBtn.classList.remove('active');
            }
        }

        function setPromptMode(mode: PromptMode) {
            selectedPromptMode = mode === 'plan' ? 'plan' : mode === 'build' ? 'build' : 'auto';
            promptModeRoot?.classList.remove('open');
            if (promptModeRoot) promptModeRoot.dataset.promptMode = selectedPromptMode;
            if (promptModeBtn) promptModeBtn.setAttribute('aria-expanded', 'false');
            if (promptModeLabel) promptModeLabel.textContent = selectedPromptMode === 'plan' ? 'Plan' : selectedPromptMode === 'build' ? 'Build' : 'Auto';
            promptModeOptions.forEach(option => {
                option.classList.toggle('active', (option as HTMLElement).dataset.promptModeOption === selectedPromptMode);
            });
        }

        setPromptMode('auto');

        promptModeBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const open = !promptModeRoot?.classList.contains('open');
            promptModeRoot?.classList.toggle('open', open);
            promptModeBtn.setAttribute('aria-expanded', String(open));
        });

        promptModeOptions.forEach(option => {
            option.addEventListener('click', (event) => {
                event.stopPropagation();
                const rawMode = (option as HTMLElement).dataset.promptModeOption;
                const mode: PromptMode = rawMode === 'plan' ? 'plan' : rawMode === 'build' ? 'build' : 'auto';
                setPromptMode(mode);
            });
        });

        document.addEventListener('click', (event) => {
            if (!promptModeRoot?.contains(event.target as Node)) {
                promptModeRoot?.classList.remove('open');
                promptModeBtn?.setAttribute('aria-expanded', 'false');
            }
        });

        // Keydown actions
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

        async function handleSubmit() {
            if (!textarea || !submitBtn) return;
            const val = textarea.value.trim();
            if (!val) return;

            submitBtn.disabled = true;
            const btnSpan = submitBtn.querySelector('span');
            if (btnSpan) btnSpan.textContent = 'Preparing workspace...';
            textarea.disabled = true;
            textarea.style.opacity = '0.5';

            try {
                await startCreateProjectFlow({
                    prompt: val,
                    mode: selectedPromptMode,
                    source: 'landing',
                    projectName: val,
                }, {
                    createProject: true,
                    onStatus: status => {
                        if (btnSpan) btnSpan.textContent = status;
                    },
                });
            } catch (error) {
                submitBtn.disabled = false;
                textarea.disabled = false;
                textarea.style.opacity = '1';
                if (btnSpan) btnSpan.textContent = 'Start building';
                showToast(error instanceof Error ? error.message : 'Unable to prepare your workspace.');
            }
        }

        submitBtn?.addEventListener('click', handleSubmit);

        // Search template trigger
        btnSearch?.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(`
                <div style="padding: 10px;">
                    <h3 style="margin-bottom: 20px;">Search Snippets</h3>
                    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" id="modal-snippet-search" placeholder="Search templates..." style="background: transparent; border: none; outline: none; color: white; width: 100%; font-size: 14px;">
                    </div>
                    <div style="display: grid; gap: 12px;">
                        <div class="snippet-item" style="padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; hover:bg-white/5 transition: background 0.2s;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">SaaS Dashboard Template</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Responsive sidebar, light theme, Recharts integration.</div>
                            <span class="snippet-val" style="display:none;">Create a light analytics dashboard for my SaaS with real-time charts.</span>
                        </div>
                        <div class="snippet-item" style="padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">Mobile App Landing Page</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Animated hero, testimonials, and API-ready contact form.</div>
                            <span class="snippet-val" style="display:none;">Build a landing page for my mobile app with a hero section, features grid, and waitlist form.</span>
                        </div>
                    </div>
                </div>
            `);

            // Listen for snippet click inside modal
            setTimeout(() => {
                document.querySelectorAll('.snippet-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const val = item.querySelector('.snippet-val')?.textContent || '';
                        if (textarea) {
                            textarea.value = val;
                            updateSubmit();
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                        }
                        closeModal();
                    });
                });
            }, 50);
        });

        // Model Select & Dropdown
        modelSelectBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!dropdown) return;
            const isOpen = dropdown.classList.contains('open');
            if (isOpen) {
                dropdown.classList.remove('open');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
                dropdown.classList.add('open');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
                
                // Position adjustment for dropdown on bottom CTAs so they don't clip offscreen
                const rect = dropdown.getBoundingClientRect();
                if (rect.bottom > window.innerHeight) {
                    dropdown.style.bottom = 'calc(100% + 12px)';
                    dropdown.style.top = 'auto';
                }
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (dropdown && !dropdown.contains(target) && !modelSelectBtn?.contains(target)) {
                dropdown.classList.remove('open');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }
        });

        // Initialize display name of model
        const savedModel = localStorage.getItem('huggy-selected-model') || 'auto';
        let foundModel = false;
        modelOptions.forEach(opt => {
            if ((opt as HTMLElement).dataset.id === savedModel) {
                modelOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                if (modelLabel) {
                    modelLabel.textContent = (opt as HTMLElement).dataset.name || '';
                }
                foundModel = true;
            }
        });
        if (!foundModel && modelLabel) {
            const activeOpt = wrapper.querySelector('.model-option.active') as HTMLElement;
            if (activeOpt) {
                modelLabel.textContent = activeOpt.dataset.name || 'Auto';
            }
        }

        // Add options click handler
        modelOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const modelId = (opt as HTMLElement).dataset.id || 'auto';
                const modelName = (opt as HTMLElement).dataset.name || '';
                
                // Persist universally
                localStorage.setItem('huggy-selected-model', modelId);
                
                // Sync all wrappers' model labels and active statuses
                document.querySelectorAll('.input-wrapper').forEach(w => {
                    const label = w.querySelector('#current-model-label, .current-model-label, span:not(.model-label-prefix)') as HTMLSpanElement | null;
                    if (label) {
                        label.textContent = modelName;
                    }
                    
                    const opts = w.querySelectorAll('.model-option');
                    opts.forEach(o => {
                        if ((o as HTMLElement).dataset.id === modelId) {
                            opts.forEach(oo => oo.classList.remove('active'));
                            o.classList.add('active');
                        }
                    });
                });

                dropdown?.classList.remove('open');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            });
        });

        // Search filtering
        const dropdownSearch = dropdown?.querySelector('.dropdown-search-input') as HTMLInputElement;
        dropdownSearch?.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
            modelOptions.forEach(opt => {
                const name = (opt as HTMLElement).dataset.name?.toLowerCase() || '';
                const desc = (opt as HTMLElement).querySelector('.opt-desc')?.textContent?.toLowerCase() || '';
                if (name.includes(query) || desc.includes(query)) {
                    (opt as HTMLElement).style.display = 'flex';
                } else {
                    (opt as HTMLElement).style.display = 'none';
                }
            });
        });
        dropdownSearch?.addEventListener('keydown', (e) => e.stopPropagation());
        dropdownSearch?.addEventListener('click', (e) => e.stopPropagation());
    });

    initProviderModelSelectors();
    normalizeAiChatInputs();

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

    // 6. Theme toggle
    themeBtn?.addEventListener('click', () => {
        if (curtainBusy || !curtain) return;
        curtainBusy = true;
        
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('huggy-theme', newTheme);
        
        // Set curtain color to the NEW theme background
        curtain.style.background = newTheme === 'light' ? '#fcfbf8' : '#171613';
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

    // Global navigation helper
    (window as any).navigate = (url: string) => {
        if (curtain) {
            curtain.style.transformOrigin = 'top';
            curtain.classList.add('falling');
            setTimeout(() => {
                window.location.href = url;
            }, 600);
        } else {
            window.location.href = url;
        }
    };

    // 9. Aggressive Scroll Reveal with safety limits and early unveil fallback
    const checkReveals = () => {
        const reveals = document.querySelectorAll('.reveal:not(.active)');
        reveals.forEach(el => {
            const rect = el.getBoundingClientRect();
            const viewHeight = window.innerHeight || document.documentElement.clientHeight;
            // Reveal if the element is inside or close to the viewport
            if (rect.top <= viewHeight * 1.05 && rect.bottom >= -150) {
                el.classList.add('active');
            }
        });
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.01, rootMargin: '0px 0px 150px 0px' });

    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });

    // Handle scroll/resize fallbacks for high security & frame compatibility
    window.addEventListener('scroll', checkReveals, { passive: true });
    window.addEventListener('resize', checkReveals, { passive: true });

    // Initial check and timed safety triggers
    checkReveals();
    setTimeout(checkReveals, 50);
    setTimeout(checkReveals, 150);
    setTimeout(checkReveals, 350);
    setTimeout(checkReveals, 700);

    // Guaranteed safety timeout to unveil all elements shortly after page starts
    setTimeout(() => {
        document.querySelectorAll('.reveal:not(.active)').forEach(el => {
            el.classList.add('active');
        });
    }, 400);

    // Iframe or Sandboxed environment compliance to guarantee visible content
    try {
        const isIframe = window.self !== window.top;
        if (isIframe) {
            document.querySelectorAll('.reveal').forEach(el => {
                el.classList.add('active');
            });
        }
    } catch (e) {
        // Safe check for cross-origin iframe security restrictions
        document.querySelectorAll('.reveal').forEach(el => {
            el.classList.add('active');
        });
    }

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

    function readImportFile(file: File): Promise<PendingPromptAttachment> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Unable to read this image.'));
            reader.onload = () => resolve({
                id: `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                lastModified: file.lastModified || Date.now(),
                dataUrl: typeof reader.result === 'string' ? reader.result : '',
                status: 'pending',
            });
            reader.readAsDataURL(file);
        });
    }

    function startImport(source: HuggyImportSource, input: { url?: string; mode?: string; file?: File } = {}) {
        const shortPromptBySource: Record<HuggyImportSource, string> = {
            figma: `Convert this Figma design into a responsive Huggy app: ${input.url || ''}`.trim(),
            github: `Import this GitHub repo, detect the app structure, run checks, and prepare it for Huggy edits: ${input.url || ''}`.trim(),
            image: input.file
                ? `Recreate the uploaded image as a clean, responsive and editable app.`
                : `Recreate an uploaded screenshot as a clean, responsive and editable app.`,
            url: `${input.mode === 'research_site' ? 'Research this website and summarize what Huggy should use:' : input.mode === 'use_as_inspiration' ? 'Use this website as inspiration for an original responsive app:' : 'Rebuild this website as an original responsive app:'} ${input.url || ''}`.trim(),
        };
        const context = buildImportContext({
            source,
            mode: input.mode,
            url: input.url,
            fileName: input.file?.name,
            mimeType: input.file?.type,
            hasAttachment: Boolean(input.file),
        }, {
            figmaConfigured: false,
            githubConfigured: true,
        });
        if (!context) {
            showToast('Choose Figma, GitHub, Image or URL.');
            return;
        }
        if (context.status === 'invalid') {
            showToast(context.limitations[0] || 'This import source is not valid.');
            return;
        }
        if (source === 'image' && !input.file) {
            showToast('Upload a screenshot or image first.');
            return;
        }

        const go = async () => {
            if (input.file) {
                await storePendingPromptAttachments([await readImportFile(input.file)]);
            }
            closeModal();
            showToast('Preparing your workspace...');
            await startCreateProjectFlow({
                prompt: shortPromptBySource[source],
                mode: context.mode === 'research_site' ? 'auto' : 'build',
                importContext: context,
                source: 'import',
                projectName: `${source} import`,
            }, {
                createProject: true,
                onStatus: showToast,
            });
        };
        void go().catch(error => showToast(error instanceof Error ? error.message : 'Unable to start import.'));
    }

    function importModalHtml(source: HuggyImportSource) {
        const titles: Record<HuggyImportSource, string> = {
            figma: 'Import from Figma',
            github: 'Import from GitHub',
            image: 'Import from Image',
            url: 'Import from URL',
        };
        const descriptions: Record<HuggyImportSource, string> = {
            figma: 'Paste a Figma link. Huggy will convert the design into a responsive app with real components and missing interactions.',
            github: 'Paste a repository URL. Huggy will inspect the structure, detect the framework, run checks and prepare a preview.',
            image: 'Upload a screenshot or mockup. Huggy will recreate it as a clean, responsive and editable app.',
            url: 'Paste a website URL. Huggy can rebuild your own site, use a site as inspiration, or research it safely.',
        };
        const input = source === 'image'
            ? `<input id="import-file" type="file" accept="image/*" style="width:100%;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:12px;padding:12px;font-size:13px;">`
            : `<input id="import-url" type="url" placeholder="${source === 'figma' ? 'https://www.figma.com/design/...' : source === 'github' ? 'https://github.com/owner/repo' : 'https://example.com'}" style="width:100%;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:12px;padding:13px 14px;font-size:13px;outline:none;">`;
        const urlModes = source === 'url'
            ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;">
                <button type="button" class="import-mode active" data-import-mode="rebuild_as_app">Rebuild app</button>
                <button type="button" class="import-mode" data-import-mode="clone_my_site">Clone my site</button>
                <button type="button" class="import-mode" data-import-mode="use_as_inspiration">Inspiration</button>
                <button type="button" class="import-mode" data-import-mode="research_site">Research</button>
              </div>`
            : '';
        return `
            <div style="display:grid;gap:18px;padding:4px 0 2px;">
                <div style="display:grid;gap:8px;">
                    <div style="width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--accent-blue,#2f6df6) 14%,transparent);display:grid;place-items:center;color:var(--accent-blue,#2f6df6);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                    </div>
                    <h2 style="margin:0;font-size:22px;letter-spacing:-.02em;">${titles[source]}</h2>
                    <p style="margin:0;color:var(--text-muted);line-height:1.55;font-size:13px;">${descriptions[source]}</p>
                </div>
                <div style="display:grid;gap:10px;">
                    ${input}
                    ${urlModes}
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button type="button" id="import-cancel" style="height:38px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);border-radius:999px;padding:0 14px;font-weight:750;cursor:pointer;">Cancel</button>
                    <button type="button" id="import-start" style="height:38px;border:1px solid #111;background:#111;color:#fff;border-radius:999px;padding:0 16px;font-weight:800;cursor:pointer;">Start import</button>
                </div>
                <style>
                    .import-mode{height:34px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-muted);border-radius:999px;font-size:12px;font-weight:750;cursor:pointer}
                    .import-mode.active{background:#111;color:#fff;border-color:#111}
                </style>
            </div>
        `;
    }

    function bindImportModal(source: HuggyImportSource) {
        let selectedMode = source === 'url' ? 'rebuild_as_app' : undefined;
        document.querySelectorAll<HTMLButtonElement>('.import-mode').forEach(button => {
            button.addEventListener('click', () => {
                selectedMode = button.dataset.importMode || 'rebuild_as_app';
                document.querySelectorAll('.import-mode').forEach(item => item.classList.remove('active'));
                button.classList.add('active');
            });
        });
        document.getElementById('import-cancel')?.addEventListener('click', closeModal);
        document.getElementById('import-start')?.addEventListener('click', () => {
            const url = (document.getElementById('import-url') as HTMLInputElement | null)?.value.trim() || '';
            const file = (document.getElementById('import-file') as HTMLInputElement | null)?.files?.[0];
            startImport(source, { url, mode: selectedMode, file });
        });
    }

    // Import buttons
    document.querySelectorAll('.import-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const source = (btn as HTMLElement).dataset.importSource as HuggyImportSource | undefined;
            if (!source) return;
            openModal(importModalHtml(source));
            bindImportModal(source);
        });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-build-prompt]').forEach(button => {
        button.addEventListener('click', () => {
            const prompt = button.dataset.buildPrompt?.trim();
            const textarea = getElement<HTMLTextAreaElement>('ai-textarea');
            if (!prompt || !textarea) return;
            textarea.value = prompt;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus({ preventScroll: true });
            textarea.closest('.input-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('Prompt ready');
        });
    });

    // Sign in flow
    document.querySelectorAll('.sign-in-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const state = await resolvePublicAuthState();
            navigateWithCurtain(state === 'signed-in' ? '/dashboard.html' : '/auth.html');
        }, { capture: true });
    });

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

